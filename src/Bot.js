require('colors');
const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

class Bot {
  ws;
  sendPingIntervalId;
  noReplyPingCount = 0;
  noReplyPingTollerant = 3;

  constructor(config) {
    this.config = config;
  }

  async getProxyIP(proxy) {
    const agent = proxy.startsWith('http')
      ? new HttpsProxyAgent(proxy)
      : new SocksProxyAgent(proxy);
    try {
      const response = await axios.get(this.config.ipCheckURL, {
        httpsAgent: agent,
      });
      console.log(`Connected through ip ${response.data.ip}`.green);
      return response.data;
    } catch (error) {
      console.error(
        `Skipping proxy ${proxy} due to connection error: ${error.message}`
          .yellow
      );
      return null;
    }
  }

  async connectToProxy(proxy, userID) {
    const formattedProxy = proxy.startsWith('socks5://')
      ? proxy
      : proxy.startsWith('http')
      ? proxy
      : `socks5://${proxy}`;
    const proxyInfo = await this.getProxyIP(formattedProxy);

    if (!proxyInfo) {
      return;
    }

    try {
      const agent = formattedProxy.startsWith('http')
        ? new HttpsProxyAgent(formattedProxy)
        : new SocksProxyAgent(formattedProxy);
      const wsURL = `wss://${this.config.wssHost}`;
      const ws = new WebSocket(wsURL, {
        agent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:92.0) Gecko/20100101 Firefox/92.0',
          Pragma: 'no-cache',
          'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          OS: 'Windows',
          Platform: 'Desktop',
          Browser: 'Mozilla',
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        console.log(`Connected to ${proxy}`.cyan);
        console.log(`Proxy IP Info: ${JSON.stringify(proxyInfo)}`.magenta);
        this.sendPing("PROXY", proxy, userID);
      });

      ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log(`Received message: ${JSON.stringify(msg)}`.blue);
        this.noReplyPingCount = 0

        if (msg.action === 'AUTH') {
          const authResponse = {
            id: msg.id,
            origin_action: 'AUTH',
            result: {
              browser_id: uuidv4(),
              user_id: userID,
              user_agent: 'Mozilla/5.0',
              timestamp: Math.floor(Date.now() / 1000),
              device_type: 'desktop',
              version: '4.28.2',
            },
          };
          ws.send(JSON.stringify(authResponse));
          console.log(
            `Sent auth response: ${JSON.stringify(authResponse)}`.green
          );
        } else if (msg.action === 'PONG') {
          console.log(`Received PONG: ${JSON.stringify(msg)}`.blue);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(
          `WebSocket closed with code: ${code}, reason: ${reason}`.yellow
        );
        setTimeout(
          () => this.connectToProxy(proxy, userID),
          this.config.retryInterval
        );
      });

      ws.on('error', (error) => {
        console.error(
          `WebSocket error on proxy ${proxy}: ${error.message}`.red
        );
        ws.terminate();
      });
    } catch (error) {
      console.error(
        `Failed to connect with proxy ${proxy}: ${error.message}`.red
      );
    }
  }

  async connectDirectly(userID) {
    try {
      const wsURL = `wss://${this.config.wssHost}`;
      const ws = new WebSocket(wsURL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:92.0) Gecko/20100101 Firefox/92.0',
          Pragma: 'no-cache',
          'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          OS: 'Windows',
          Platform: 'Desktop',
          Browser: 'Mozilla',
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        console.log(`Connected directly without proxy`.cyan);
        this.sendPing("DIRECT",'Direct', userID);
      });

      ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log(`Received message: ${JSON.stringify(msg)}`.blue);
        this.noReplyPingCount = 0;

        if (msg.action === 'AUTH') {
          const authResponse = {
            id: msg.id,
            origin_action: 'AUTH',
            result: {
              browser_id: uuidv4(),
              user_id: userID,
              user_agent: 'Mozilla/5.0',
              timestamp: Math.floor(Date.now() / 1000),
              device_type: 'desktop',
              version: '4.28.2',
            },
          };
          ws.send(JSON.stringify(authResponse));
          console.log(
            `Sent auth response: ${JSON.stringify(authResponse)}`.green
          );
        } else if (msg.action === 'PONG') {
          console.log(`Received PONG: ${JSON.stringify(msg)}`.blue);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(
          `WebSocket closed with code: ${code}, reason: ${reason}`.yellow
        );
        setTimeout(
          () => this.connectDirectly(userID),
          this.config.retryInterval
        );
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error: ${error.message}`.red);
        ws.terminate();
      });
    } catch (error) {
      console.error(`Failed to connect directly: ${error.message}`.red);
    }
  }

  sendPing(connectType, proxy, userID) {
    this.sendPingIntervalId = setInterval(() => {
      const pingMessage = {
        id: uuidv4(),
        version: '1.0.0',
        action: 'PING',
        data: {},
      };
      this.ws.send(JSON.stringify(pingMessage));

      this.noReplyPingCount++
      if(this.noReplyPingCount >= this.noReplyPingTollerant){
        console.error(
          `Max send ping tollerant, reconnectiong...`
            .red
        );
        this.noReplyPingCount = 0;
        clearInterval(this.sendPingIntervalId);
        this.ws.terminate();

        if(connectType === "DIRECT"){
          this.connectDirectly(userID);
        }else if(connectType === "PROXY"){
          this.connectToProxy(proxy, userID)
        }
      }else{
        console.log(
          `Sent ping - IP: ${proxy}, Message: ${JSON.stringify(pingMessage)}`
            .cyan
        );
      }

    }, 26000);
  }
}

module.exports = Bot;
