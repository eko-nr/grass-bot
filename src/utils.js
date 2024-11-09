require('colors');

const delay = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function displayHeader() {
    process.stdout.write('\x1Bc');
    console.log('Good luck :)'.cyan);
  }

module.exports = { delay, displayHeader };
