// cnc optimize <selector> [--persist] — tune a box for heavy dev work.
//
// Applies (runtime, reversible, no reboot):
//   • no swap        swapoff -a + vm.swappiness=0
//   • good IO        I/O scheduler -> none (NVMe/SSD), larger readahead
//   • many files     inotify watchers, fs.file-max, nofile ulimit raised
// With --persist (survives reboot, INVASIVE — needs a reboot to fully apply):
//   • swap off in /etc/fstab
//   • mitigations=off on the kernel cmdline (GRUB)
//
// Everything is idempotent (drop-in files under /etc/{sysctl,security/limits,udev}.d,
// tagged 99-cnc-dev). Nothing here touches secrets or app code.
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const persist = argv.includes("--persist");
const sel = argv.filter((a) => a !== "--persist");
if (sel.length === 0) fail("usage: cnc optimize [--all | --pool <p> | <team>...] [--persist]");
const teams = selectTeams(sel);

// Runtime + drop-in tunings (safe, reversible, no reboot).
const RUNTIME = String.raw`set -e
# --- sysctl drop-in: no-swap pressure + dev file limits ---
sudo tee /etc/sysctl.d/99-cnc-dev.conf >/dev/null <<'EOF'
vm.swappiness=0
fs.inotify.max_user_watches=1048576
fs.inotify.max_user_instances=8192
fs.file-max=2097152
EOF
sudo sysctl --system >/dev/null
# --- no swap now ---
sudo swapoff -a || true
# --- nofile ulimit for the login user ---
sudo tee /etc/security/limits.d/99-cnc-dev.conf >/dev/null <<'EOF'
* soft nofile 1048576
* hard nofile 1048576
EOF
# --- I/O scheduler none + readahead (persist via udev, apply now) ---
sudo tee /etc/udev/rules.d/60-cnc-dev.rules >/dev/null <<'EOF'
ACTION=="add|change", KERNEL=="nvme[0-9]*n[0-9]*|sd[a-z]", ATTR{queue/scheduler}="none", ATTR{queue/read_ahead_kb}="2048"
EOF
for q in /sys/block/*/queue/scheduler; do grep -q none "$q" 2>/dev/null && echo none | sudo tee "$q" >/dev/null || true; done
echo "runtime tunings applied"`;

// Persistent, reboot-required, invasive.
const PERSIST = String.raw`set -e
# --- disable swap across reboots ---
sudo sed -i.cnc-bak '/\bswap\b/ s/^\([^#]\)/#\1/' /etc/fstab || true
# --- mitigations=off on kernel cmdline ---
if ! grep -q 'mitigations=off' /etc/default/grub; then
  sudo sed -i.cnc-bak 's/^GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"/GRUB_CMDLINE_LINUX_DEFAULT="\1 mitigations=off"/' /etc/default/grub
  (command -v update-grub >/dev/null && sudo update-grub) || (command -v grub2-mkconfig >/dev/null && sudo grub2-mkconfig -o /boot/grub2/grub.cfg) || true
fi
echo "persistent changes written (fstab + grub) — reboot to apply mitigations=off"`;

console.log(c.bold(`optimizing for dev: ${teams.map((t) => t.id).join(", ")}${persist ? c.yellow("  [--persist: reboot needed]") : ""}`));
await mapTeams(teams, async (t) => {
  const r = await sshExec(t, RUNTIME, { timeoutMs: 300_000 });
  console.log(`${r.code === 0 ? c.green("✓") : c.red("✗")} ${t.id} runtime  ${c.dim((r.stdout || r.stderr).trim().split("\n").pop() ?? "")}`);
  if (persist) {
    const p = await sshExec(t, PERSIST, { timeoutMs: 300_000 });
    console.log(`${p.code === 0 ? c.yellow("⟳") : c.red("✗")} ${t.id} persist  ${c.dim((p.stdout || p.stderr).trim().split("\n").pop() ?? "")}`);
  }
});
if (persist) console.log(c.dim("\nreboot the boxes to activate mitigations=off:  cnc exec <sel> -- sudo reboot"));
