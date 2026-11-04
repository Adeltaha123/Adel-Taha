# Running the My PA server 24/7 (Oracle Cloud Always Free)

This puts the API on a free Oracle Cloud machine that runs all the time. One script sets everything up: the API as a service that restarts by itself, HTTPS through Caddy at a free `<ip>.sslip.io` address (no domain needed), automatic updates from GitHub every 5 minutes, and a daily database backup kept for 14 days. It works the same on any Ubuntu 22.04/24.04 server.

## 1. Create the Oracle account

Sign up at <https://signup.cloud.oracle.com>. Choose your **home region** carefully, because it cannot be changed; a nearby region such as Frankfurt or Jeddah is a good choice. Oracle asks for a card to verify you, but Always Free resources are never charged. If the card is declined, try another card. Some Egyptian bank cards are refused at this step.

## 2. Create the machine

1. Open **Compute → Instances → Create instance**.
2. **Image:** Canonical Ubuntu 24.04.
3. **Shape:** pick one marked *Always Free-eligible*: `VM.Standard.A1.Flex` (1 OCPU, 6 GB) or, if Oracle says it is out of capacity, `VM.Standard.E2.1.Micro`.
4. **SSH keys:** choose *Generate a key pair* and click **Save private key**. Keep the downloaded `.key` file; you need it to log in.
5. Click **Create** and wait until the status is *Running*. Copy the **Public IP address**.

## 3. Open the web ports

1. On the instance page, click the **Subnet** link, then the **Default Security List**.
2. Click **Add Ingress Rules** and add: Source CIDR `0.0.0.0/0`, IP Protocol `TCP`, Destination Port Range `80`.
3. Add the same again with port `443`.

## 4. Run the setup

In Windows PowerShell, log in (use your key file's path and the public IP):

```powershell
ssh -i "$HOME\Downloads\ssh-key-2026-11-04.key" ubuntu@YOUR-IP
```

If Windows complains the key is too open, run this once and try again:
`icacls "$HOME\Downloads\ssh-key-2026-11-04.key" /inheritance:r /grant:r "$($env:USERNAME):R"`

On the server, run:

```bash
curl -fsSL https://raw.githubusercontent.com/Adeltaha123/Adel-Taha/main/deploy/server/setup.sh | bash
```

It asks for the OpenAI API key (for voice and the assistant) and the contact shown to people who want to subscribe, then takes a few minutes. At the end it prints the server address, for example `https://152-70-1-2.sslip.io`.

## 5. Point the app at the server

On your PC, in the project folder:

```powershell
npm run server:address -- https://152-70-1-2.sslip.io
```

The website and app use it within a minute. Do not use `npm run server:online` any more; it refuses to replace the 24/7 server unless you add `-- --force`. For Expo Go on your phone, set `EXPO_PUBLIC_API_URL=https://152-70-1-2.sslip.io` in `mobile/.env` and restart Expo.

## Moving your existing accounts (optional)

Accounts made while the server ran on your PC live in `data\my-pa.sqlite`. To move them, stop the PC server, then:

```powershell
scp -i "$HOME\Downloads\ssh-key-2026-11-04.key" data\my-pa.sqlite ubuntu@YOUR-IP:/tmp/my-pa.sqlite
ssh -i "$HOME\Downloads\ssh-key-2026-11-04.key" ubuntu@YOUR-IP "sudo mypa-import /tmp/my-pa.sqlite"
```

The server keeps its previous database in `/opt/mypa/backups`.

## Day to day

| Task | Command (over SSH) |
|---|---|
| Activate a subscription | `cd /opt/mypa && sudo -u mypa npm run plan -- someone@mail.com personal 1` |
| Check the API | `systemctl status mypa` or `journalctl -u mypa -n 50` |
| Update now instead of within 5 minutes | `sudo mypa-update --force` |
| Change the OpenAI key or contact | `sudo nano /opt/mypa/.env`, then `sudo systemctl restart mypa` |
| Backups | `/opt/mypa/backups`, one file per day for 14 days |

Pushing to `main` on GitHub updates the server automatically. Oracle may reclaim Always Free machines that stay almost idle for a week; a server that people use is not idle, and Oracle emails a warning first.
