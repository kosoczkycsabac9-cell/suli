import type { LatencyResult, NetworkActionId, NetworkAdapter, NetworkState } from '../../shared/types';
import { IS_WINDOWS, isElevated, runPowerShell, runPowerShellJson, toArray } from './shell';
import { logger } from './logger';

const PS_ADAPTERS = String.raw`
Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object {
  $a = $_
  $conf = $null
  try { $conf = Get-NetIPConfiguration -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue } catch {}
  $dhcp = $false
  try { $dhcp = (Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp -eq 'Enabled' } catch {}
  [pscustomobject]@{
    Name = $a.Name
    Description = $a.InterfaceDescription
    Mac = $a.MacAddress
    Status = $a.Status
    LinkSpeed = $a.LinkSpeed
    IPv4 = @($conf.IPv4Address.IPAddress)
    IPv6 = @($conf.IPv6Address.IPAddress)
    Gateway = @($conf.IPv4DefaultGateway.NextHop)
    Dns = @($conf.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses } )
    Dhcp = $dhcp
  }
}
`;

async function getAdapters(): Promise<NetworkAdapter[]> {
  if (!IS_WINDOWS) return [];
  const raw = await runPowerShellJson<any>(PS_ADAPTERS, [], { timeoutMs: 30_000 });
  return toArray(raw).map((a: any) => ({
    name: String(a?.Name ?? ''),
    description: String(a?.Description ?? ''),
    macAddress: String(a?.Mac ?? ''),
    status: String(a?.Status ?? ''),
    linkSpeed: String(a?.LinkSpeed ?? ''),
    ipv4: toArray(a?.IPv4).map(String).filter(Boolean),
    ipv6: toArray(a?.IPv6).map(String).filter(Boolean),
    gateway: toArray(a?.Gateway).map(String).filter(Boolean),
    dnsServers: toArray(a?.Dns).map(String).filter(Boolean),
    dhcpEnabled: a?.Dhcp === true,
  }));
}

async function measureLatency(hosts: string[]): Promise<LatencyResult[]> {
  if (!IS_WINDOWS) return [];
  const list = hosts.map((h) => `'${h}'`).join(',');
  const raw = await runPowerShellJson<any>(
    `@(${list}) | ForEach-Object {
       $h = $_
       $ping = New-Object System.Net.NetworkInformation.Ping
       $sent = 0; $ok = 0; $sum = 0
       for ($i = 0; $i -lt 3; $i++) {
         $sent++
         try {
           $r = $ping.Send($h, 1500)
           if ($r.Status -eq 'Success') { $ok++; $sum += $r.RoundtripTime }
         } catch {}
       }
       [pscustomobject]@{
         Host = $h
         Reachable = ($ok -gt 0)
         Avg = if ($ok -gt 0) { [math]::Round($sum / $ok, 1) } else { $null }
         Loss = [math]::Round((($sent - $ok) / $sent) * 100, 0)
       }
     }`,
    [],
    { timeoutMs: 30_000 },
  );
  return toArray(raw).map((r: any) => ({
    host: String(r?.Host ?? ''),
    reachable: r?.Reachable === true,
    averageMs: r?.Avg == null ? null : Number(r.Avg),
    packetLossPercent: Number(r?.Loss) || 0,
  }));
}

export async function getNetworkState(): Promise<NetworkState> {
  const [adapters, latency] = await Promise.all([
    getAdapters().catch(() => [] as NetworkAdapter[]),
    measureLatency(['1.1.1.1', '8.8.8.8', 'www.microsoft.com']).catch(() => [] as LatencyResult[]),
  ]);
  return {
    adapters,
    latency,
    internetConnected: latency.some((l) => l.reachable),
    publicDnsWorking: latency.find((l) => l.host === 'www.microsoft.com')?.reachable ?? false,
  };
}

interface ActionDefinition {
  command: string;
  needsAdmin: boolean;
  rebootRecommended: boolean;
  label: string;
}

const ACTIONS: Record<NetworkActionId, (adapter?: string) => ActionDefinition> = {
  'flush-dns': () => ({
    command: 'ipconfig /flushdns',
    needsAdmin: false,
    rebootRecommended: false,
    label: 'DNS gyorsítótár ürítése',
  }),
  'release-renew-ip': () => ({
    command: 'ipconfig /release; ipconfig /renew',
    needsAdmin: true,
    rebootRecommended: false,
    label: 'IP cím felszabadítása és újrakérése',
  }),
  'winsock-reset': () => ({
    command: 'netsh winsock reset',
    needsAdmin: true,
    rebootRecommended: true,
    label: 'Winsock katalógus visszaállítása',
  }),
  'tcpip-reset': () => ({
    command: 'netsh int ip reset',
    needsAdmin: true,
    rebootRecommended: true,
    label: 'TCP/IP verem visszaállítása',
  }),
  'restart-adapter': (adapter) => ({
    command: `Restart-NetAdapter -Name '${(adapter ?? '').replace(/'/g, "''")}' -Confirm:$false`,
    needsAdmin: true,
    rebootRecommended: false,
    label: `Hálózati adapter újraindítása (${adapter ?? ''})`,
  }),
};

/**
 * Hálózati művelet futtatása. Az admin jogot igénylő parancsokat csak akkor engedjük,
 * ha a folyamat emelt szinten fut – különben érthető hibaüzenetet adunk.
 */
export async function runNetworkAction(
  action: NetworkActionId,
  adapterName?: string,
): Promise<{ output: string; rebootRecommended: boolean }> {
  if (!IS_WINDOWS) throw new Error('A hálózati műveletek csak Windows rendszeren érhetők el.');
  const def = ACTIONS[action]?.(adapterName);
  if (!def) throw new Error('Ismeretlen hálózati művelet.');
  if (action === 'restart-adapter' && !adapterName) throw new Error('Nincs kiválasztva hálózati adapter.');

  if (def.needsAdmin && !(await isElevated())) {
    throw new Error(
      `A(z) "${def.label}" művelethez rendszergazdai jogosultság szükséges. Indítsd újra az alkalmazást rendszergazdaként.`,
    );
  }

  try {
    const output = await runPowerShell(def.command, { timeoutMs: 90_000 });
    logger.record({
      area: 'Network',
      action: def.label,
      oldValue: 'Aktuális hálózati konfiguráció',
      newValue: def.rebootRecommended ? 'Visszaállítva (újraindítás ajánlott)' : 'Végrehajtva',
      success: true,
    });
    return { output: output.trim() || 'A művelet sikeresen lefutott.', rebootRecommended: def.rebootRecommended };
  } catch (err) {
    const message = (err as Error).message;
    logger.record({ area: 'Network', action: def.label, oldValue: null, newValue: null, success: false, message });
    throw new Error(message);
  }
}
