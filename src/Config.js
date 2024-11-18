class Config {
  constructor() {
    this.ipCheckURL = 'https://ipinfo.io/json';
    this.wssList = ['proxy2.wynd.network:4650'];
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
