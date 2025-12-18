# Cloudflare Tunnel Setup for Clipset

Guide to expose your self-hosted Clipset instance to the internet securely using Cloudflare Tunnel.

## Why Cloudflare Tunnel?

- **No port forwarding required** - Works behind NAT/firewalls
- **No public IP needed** - Perfect for home networks
- **Free SSL/TLS** - Automatic HTTPS certificates
- **DDoS protection** - Built-in Cloudflare protection
- **Private tunnel** - No direct exposure of your server

## Prerequisites

- Clipset running locally (http://localhost)
- Cloudflare account (free tier works)
- Domain name (can be registered through Cloudflare)

---

## Installation

### Method 1: Native Binary (Recommended)

**Linux:**
```bash
# Download
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install
sudo dpkg -i cloudflared-linux-amd64.deb

# Verify
cloudflared --version
```

**macOS:**
```bash
brew install cloudflared
```

**Windows:**
Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

### Method 2: Docker

```bash
docker pull cloudflare/cloudflared:latest
```

---

## Setup Steps

### 1. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window. Select your domain and authorize.

### 2. Create Tunnel

```bash
cloudflared tunnel create clipset
```

**Output:**
```
Tunnel credentials written to: /home/user/.cloudflared/<TUNNEL_ID>.json
Created tunnel clipset with id <TUNNEL_ID>
```

**Save the Tunnel ID** - you'll need it later.

### 3. Create Configuration File

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>  # Replace with your tunnel ID
credentials-file: /home/user/.cloudflared/<TUNNEL_ID>.json  # Replace with your path

ingress:
  - hostname: clipset.yourdomain.com  # Replace with your domain
    service: http://localhost:80
  - service: http_status:404
```

**Replace:**
- `<TUNNEL_ID>` - Your tunnel ID from step 2
- `/home/user/` - Your actual home directory path
- `clipset.yourdomain.com` - Your actual domain

### 4. Route DNS

```bash
cloudflared tunnel route dns clipset clipset.yourdomain.com
```

This creates a CNAME record pointing to your tunnel.

### 5. Update Clipset Configuration

Edit your `.env` file:

```env
# Add your Cloudflare domain to CORS origins
BACKEND_CORS_ORIGINS=http://localhost,https://clipset.yourdomain.com

# Update frontend API URL for production
VITE_API_BASE_URL=https://clipset.yourdomain.com/api
```

**Restart Clipset:**
```bash
docker compose down
docker compose up -d
```

### 6. Start Tunnel

```bash
cloudflared tunnel run clipset
```

You should see:
```
... Connection established ...
... Registered tunnel connection ...
```

### 7. Test External Access

Open https://clipset.yourdomain.com in your browser.

You should see the Clipset login page!

---

## Running as a Service

### Linux (systemd)

```bash
# Install as service
sudo cloudflared service install

# Start service
sudo systemctl start cloudflared

# Enable on boot
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### Docker

Create `docker-compose.tunnel.yml`:

```yaml
version: '3.8'

services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflare-tunnel
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ~/.cloudflared:/etc/cloudflared
    network_mode: host
    restart: always
```

Start:
```bash
docker compose -f docker-compose.tunnel.yml up -d
```

---

## Troubleshooting

### Tunnel Not Connecting

**Check configuration:**
```bash
cloudflared tunnel info clipset
```

**Test locally first:**
```bash
# Does http://localhost work?
curl http://localhost
```

**Check firewall:**
```bash
# Cloudflared needs outbound HTTPS (443)
sudo ufw allow out 443/tcp
```

### DNS Not Resolving

**Check DNS propagation:**
```bash
nslookup clipset.yourdomain.com
```

May take up to 5 minutes to propagate.

### CORS Errors

**Ensure domain is in CORS origins:**

`.env`:
```env
BACKEND_CORS_ORIGINS=http://localhost,https://clipset.yourdomain.com
```

Restart containers after changing.

### Upload Timeouts

**Increase timeout in config.yml:**

```yaml
ingress:
  - hostname: clipset.yourdomain.com
    service: http://localhost:80
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      tlsTimeout: 10s
      tcpKeepAlive: 30s
      keepAliveConnections: 100
      keepAliveTimeout: 90s
```

---

## Security Best Practices

### 1. Disable Direct Access (Optional)

If using Cloudflare Tunnel, you can disable direct port 80 access:

`docker-compose.yml`:
```yaml
nginx:
  ports:
    - "127.0.0.1:80:80"  # Only localhost access
```

### 2. Zero Trust Access (Optional)

Add authentication layer via Cloudflare Access:

1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications
2. Add application for your domain
3. Set authentication rules (email, Google, etc.)

### 3. Rate Limiting

Cloudflare automatically provides DDoS protection and rate limiting.

For custom rules:
1. Go to Cloudflare Dashboard → Security → WAF
2. Create rate limiting rules

---

## Monitoring

### Tunnel Metrics

View in Cloudflare Dashboard:
- Zero Trust → Networks → Tunnels → clipset

Shows:
- Connection status
- Traffic statistics
- Error logs

### Local Logs

```bash
# Systemd service
sudo journalctl -u cloudflared -f

# Docker
docker logs -f cloudflare-tunnel
```

---

## Costs

- **Cloudflare Tunnel**: Free
- **Domain**: ~$10/year (varies)
- **Cloudflare Zero Trust**: Free up to 50 users

---

## Alternative: ngrok

If you prefer ngrok:

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Authenticate
ngrok authtoken <YOUR_TOKEN>

# Start tunnel
ngrok http 80

# Note the public URL (e.g., https://abc123.ngrok.io)
# Add to CORS in .env
```

**Note:** ngrok free tier has limitations (random URLs, 2-hour sessions).

---

## Resources

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Zero Trust Dashboard](https://one.dash.cloudflare.com/)
- [Troubleshooting Guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/troubleshooting/)
