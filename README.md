#### This plugin is still work in progress.

# Homebridge Slide Remote Local API

![npm](https://img.shields.io/npm/v/homebridge-slide-remote)

A homebridge plugin to use the [Slide](https://slide.store) curtain motor in HomeKit using Homebridge with the Local API. For now I
implemented the accessory type of homebridge, so no dynamic platform.

# Installation

The following command can be used to install the plugin on the Homebridge server:

```bash
npm install -g homebridge-slide-curtain
```

After that you will need to enter the following details into the ~/.homebridge/config.json:

```bash
{
  "accessories": [
    {
      "accessory": "HomebridgeSlideCurtain", #REQUIRED
      "name": "name", #REQUIRED. Your desired name.
      "ip": "x.x.x.x", #REQUIRED. Fixed IP configured for your Slide on your router.
      "code": "xxxxxxxx", #REQUIRED. 8 digit code in the sticker on the top of your Slide.
      "poll_interval": x #OPTIONAL. Time in seconds to poll the Slide curtain. Defaults to 5s.
    }
 }
```

Now start or restart homebridge and your Slide should appear in the HomeKit app.

# Known Issues

- [ ] If you control your Slide from outside of homekit (with the Slide remote control or just by hand with the Touch & Go function) the
      status of the accesory will update in the worst case scenario in "poll_interval" seconds setted in the config.

- [ ] The code is far from perfect or optimized, this is literally my first time coding in node.

# Todo

- [ ] Clean up and refactor code
- [ ] Correctly report errors by marking the accessory as "Not responding" in the Home app.

#### Special thanks to renssies and his homebridge-slide-remote plugin which I heavily used to develop this plugin.
