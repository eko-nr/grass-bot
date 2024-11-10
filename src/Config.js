class Config {
  constructor() {
    this.ipCheckURL = 'https://ipinfo.io/json';
    this.wssHost = 'proxy.wynd.network:4444';
    this.prompt = {
      show: false,
    }
    this.proxy = {
      source: "CUSTOM", // CUSTOM | NO PROXY
      filename: "proxy.txt"
    }
    this.retryInterval = 2000;
  }
}

module.exports = Config;
