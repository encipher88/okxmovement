const fs = require('fs').promises;
const { AptosAccount } = require('aptos');
const fetch = require('node-fetch'); // Ensure node-fetch is installed
const { HttpsProxyAgent } = require('https-proxy-agent'); // For using proxies

// Function to read private keys from a file
async function getPrivateKeys() {
  try {
    const data = await fs.readFile('./privkey.txt', 'utf8');
    return data.trim().split('\n').map(key => key.trim().slice(2)); // Strip '0x' if present
  } catch (err) {
    console.error("Error reading private keys:", err);
    throw err;
  }
}

// Function to read proxies from a file
async function getProxies() {
  try {
    const data = await fs.readFile('./proxy.txt', 'utf8');
    return data.trim().split('\n').map(proxy => proxy.trim());
  } catch (err) {
    console.error("Error reading proxies:", err);
    throw err;
  }
}

// Function to parse proxy and add protocol
const parseProxy = (proxy) => {
  if (!proxy || typeof proxy !== 'string') {
    throw new Error('Invalid proxy format');
  }

  const parts = proxy.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid proxy format: ${proxy}`);
  }

  const [auth, hostPort] = parts;
  const [username, password] = auth.split(':');
  const [host, port] = hostPort.split(':');

  if (!username || !password || !host || !port) {
    throw new Error(`Incomplete proxy information: ${proxy}`);
  }

  return { username, password, host, port };
};

// Function to perform the faucet request for a single address
async function performSingleRequest(address, proxy) {
  const url = `https://faucet.testnet.bardock.movementnetwork.xyz/mint?amount=1000000000&address=${address}`;
  
  const parsedProxy = parseProxy(proxy);
  const proxyUrl = `http://${parsedProxy.username}:${parsedProxy.password}@${parsedProxy.host}:${parsedProxy.port}`;
  const agent = new HttpsProxyAgent(proxyUrl);

  const options = {
    method: "POST",
    headers: {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
    },
    agent, // Attach proxy agent
  };

  let success = false;

  // Retry the request until success
  while (!success) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        console.log(`Request for ${address} failed, retrying...`);
        continue; // Retry on failure
      }

      const data = await response.json();
      console.log(`Request for ${address} succeeded:`, data);
      success = true; // Exit loop on success

    } catch (error) {
      console.log(`Error for ${address} using proxy ${proxy}, retrying...`, error);
    }
  }
}

// Function to perform the requests for all addresses concurrently
async function performConcurrentRequests() {
  try {
    // Read private keys and proxies
    const privKeys = await getPrivateKeys();
    const proxies = await getProxies();

    if (privKeys.length > proxies.length) {
      throw new Error('Not enough proxies for the number of private keys.');
    }

    // Derive addresses from private keys
    const addresses = privKeys.map(key => {
      const account = new AptosAccount(Buffer.from(key, 'hex'));
      return account.address().toString(); // Returns '0x'-prefixed address
    });

    // Perform requests concurrently for all addresses
    const promises = addresses.map((addr, index) => {
      const proxy = proxies[index]; // Assign one proxy per address
      return performSingleRequest(addr, proxy);
    });

    // Wait for all requests to complete
    await Promise.all(promises);
    console.log('All requests completed.');

  } catch (error) {
    console.log("Error during execution:", error);
  }
}

// Perform requests concurrently
performConcurrentRequests();
