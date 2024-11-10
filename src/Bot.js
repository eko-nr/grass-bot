require('colors');
const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const moment = require("moment")

class Bot {
  isOnReconnecting = false;
  timeoutSendPing = 65000;
  lastTimeRepliedPing;
  reconnectNoReplyPingTime = 5;

  constructor(config) {
    this.config = config;
  }

  async getProxyIP(proxy, userID) {
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
      this.connectToProxy(proxy, userID)
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
      this.isOnReconnecting = false;
      this.lastTimeRepliedPing = null;

      ws.on('open', () => {
        console.log(`Connected to ${proxy}`.cyan);
        console.log(`Proxy IP Info: ${JSON.stringify(proxyInfo)}`.magenta);
        this.sendPingDelay(ws, "PROXY", proxy, userID);
      });

      ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log(`Received message: ${JSON.stringify(msg)}`.blue);

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
          this.lastTimeRepliedPing = moment();
          this.sendPingDelay(ws, "PROXY", proxy, userID);
        }
      });

      const poolingReplyPing = setInterval(() => {
        if(
          this.lastTimeRepliedPing && 
          moment(this.lastTimeRepliedPing).add(this.reconnectNoReplyPingTime, "minutes") < moment()
        ){
          console.log("No reply ping!".yellow);
          ws.terminate();
        }
      }, 1000)

      ws.on('close', (code, reason) => {
        console.log(
          `WebSocket closed with code: ${code}, reason: ${reason}`.yellow
        );

        if(!this.isOnReconnecting){
          clearInterval(poolingReplyPing)
          setTimeout(
            () => this.connectToProxy(proxy, userID),
            this.config.retryInterval
          );
        }
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
      this.isOnReconnecting = false;
      this.lastTimeRepliedPing = null;

      ws.on('open', () => {
        console.log(`Connected directly without proxy`.cyan);
        this.sendPingDelay(ws, "DIRECT",'Direct', userID);
      });

      ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log(`Received message: ${JSON.stringify(msg)}`.blue);

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
          this.lastTimeRepliedPing = moment()
          this.sendPingDelay(ws, "DIRECT",'Direct', userID);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(
          `WebSocket closed with code: ${code}, reason: ${reason}`.yellow
        );
        if(!this.isOnReconnecting){
          setTimeout(
            () => this.connectDirectly(userID),
            this.config.retryInterval
          );
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error: ${error.message}`.red);
        ws.terminate();
      });

      const poolingReplyPing = setInterval(() => {
        if(
          this.lastTimeRepliedPing && 
          moment(this.lastTimeRepliedPing).add(this.reconnectNoReplyPingTime, "minutes") < moment()
        ){
          clearInterval(poolingReplyPing);
          console.log("No reply ping!".yellow);
          ws.terminate();
        }
      }, 1000)
    } catch (error) {
      console.error(`Failed to connect directly: ${error.message}`.red);
    }
  }

  sendPingDelay(ws, connectType, proxy, userID) {
    setTimeout(() => {
      const pingMessage = {
        id: uuidv4(),
        version: '1.0.0',
        action: 'PING',
        data: {},
      };
      ws.send(JSON.stringify(pingMessage));
  
      console.log(
        `Sent ping - IP: ${proxy}, Message: ${JSON.stringify(pingMessage)}`
          .cyan
      );
    }, this.timeoutSendPing);
  }
}

module.exports = Bot;
