# Looproom

A browser music practice player with pitch-preserving speed control, waveform navigation and A–B loops. Self-host it on a Raspberry Pi with Docker or Podman, or serve `dist/` with any static web server.

## Features

- Import local songs or try the included original demo.
- Adjust playback speed from 0.25× to 1.5×. Browser-native pitch preservation is enabled where supported.
- Drag the A/B markers, enter exact times or set loop points at the current playhead.
- Repeat a selected section while practising.
- Save tracks in browser IndexedDB and settings in localStorage when browser permissions and space allow.
- Use the keyboard or the responsive touch controls.

## Docker

Clone this repository, change into its directory, then run:

```bash
docker build -t looproom:local .
docker run -d --name looproom -p 8081:80 looproom:local
```

Alternatively, with Docker Compose:

```bash
docker compose up -d --build
```

Choose either `docker run` or Compose.

## Podman

From the repository directory:

```bash
podman build -t localhost/looproom:local .
podman run -d --name looproom -p 8081:80 localhost/looproom:local
```

These Podman commands can run rootless. Host port 8081 does not require a privileged port binding. Automatic startup after reboot can be configured separately with a systemd/Quadlet service.

## Open the player

The container listens on port 80; Docker or Podman publishes it as port 8081 on the Pi.

Open `http://YOUR_PI_IP:8081` on a device on the same network, or `http://localhost:8081` in a browser running on the Pi. Replace `YOUR_PI_IP` with the Pi's actual address.

The Dockerfile uses the official multi-architecture Nginx Alpine image. Building on the Pi selects its supported native architecture. The initial image pull needs internet access; the built app has no external runtime dependencies. There is no application build step.

## Audio and storage

Playback, waveform decoding and speed adjustment happen in the browser you use. Sound comes from that device. Imported audio remains in that browser; this container does not maintain a shared music library on the Pi. No ChatGPT login is required for this self-hosted copy.

Browser data is associated with the address you use. Changing addresses or clearing browser data can make previous tracks unavailable, so keep your original files. Media format support depends on the browser; MP3 and WAV are suitable starting points. Browser seeking can introduce a small gap at loop boundaries.

`dist/assets/sunday-groove.wav` is an original synthesized demo created for this app.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| A / B | Set loop start / end |
| L | Toggle looping |
| Left / right | Seek five seconds |
| Minus / plus | Adjust speed by 0.05× |
| ? | Open the guide |
| Arrows on a focused marker | Move the point by 0.1 seconds |
| Shift + arrows on a focused marker | Move the point by one second |

## Validation

The browser app was checked for playback, speed changes, loop timing, marker controls, imports and saved-track restoration. JavaScript syntax can be checked with:

```bash
node --check dist/app.js
```

Package contents and Dockerfile copy paths were checked. Docker and Podman were unavailable in the preparation environment, so the container has not been built or tested on Raspberry Pi hardware there.
