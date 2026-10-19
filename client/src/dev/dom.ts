export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function log(text: string) {
  $('log').textContent += `${new Date().toLocaleTimeString()}  ${text}\n`;
}

export function fillSelect(select: HTMLSelectElement, devices: MediaDeviceInfo[], selected: string | undefined, fallback: string) {
  select.replaceChildren(
    new Option('System default', ''),
    ...devices
      .filter((d) => d.deviceId && d.deviceId !== 'default')
      .map((d, i) => new Option(d.label || `${fallback} ${i + 1}`, d.deviceId)),
  );
  select.value = selected ?? '';
}
