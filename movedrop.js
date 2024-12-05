const fs = require('fs');
const axios = require('axios');
const { AptosAccount } = require('aptos');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// File paths
const proxyFilePath = './proxy.txt';
const privKeyFilePath = './privkey.txt';
const okxWalletFilePath = './okxWallet.txt';
const okxUidFilePath = './okxUid.txt';

const readLines = (filePath) => fs.readFileSync(filePath, 'utf-8')
  .split('\n')  // Split by newline
  .map(line => line.replace(/\r/g, ''))  // Remove any \r characters (Windows-style line breaks)
  .filter(Boolean);  // Remove empty lines


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

// Function to test proxy with ipinfo.io
const testProxy = async (proxy) => {
  try {
    const { username, password, host, port } = parseProxy(proxy);
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;

    const agent = new HttpsProxyAgent(proxyUrl);

    const response = await axios.get('https://ipinfo.io', {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });

    console.log(`[INFO] Proxy is working. IP: ${response.data.ip}`);
    return true;  // Proxy is working
  } catch (error) {
    console.error(`[ERROR] Proxy test failed: ${error.message}`);
    return false;  // Proxy failed
  }
};

// Function to perform HTTP requests with axios and proxy
const fetchWithProxy = async (url, options, proxy, retries = 10) => {
  try {
    const { username, password, host, port } = parseProxy(proxy);
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;

    const agent = new HttpsProxyAgent(proxyUrl);

    const response = await axios(url, {
      ...options,
      httpsAgent: agent,
      headers: options.headers || {},
    });
    
    
    
    
    return response.data;
  } catch (error) {
    console.error(`[ERROR] fetch error: ${error.message}`);
    // Check for specific error response
    if (
      error.response &&
      error.response.data &&
      error.response.data.success === false &&
      error.response.data.error === 'Aptos account registered already'
    ) {
      console.error('[SUCCESS] Account already registered. Stopping retries.');
      throw error; // Exit without retries
    }
        
    
    if (retries > 0) {
      console.log(`[INFO] Retrying request...`);
      await sleep(3000);
      return fetchWithProxy(url, options, proxy, retries - 1);  // Retry
    } else {
      throw error;
    }
  }
};

// Main function to process entries
const main = async () => {
  try {
    const proxies = readLines(proxyFilePath);
    const privKeys = readLines(privKeyFilePath);
    const okxWallets = readLines(okxWalletFilePath);
    const okxUids = readLines(okxUidFilePath);

    console.log(`[INFO] Loaded ${proxies.length} proxies, ${privKeys.length} private keys, ${okxWallets.length} OKX wallets, ${okxUids.length} OKX UIDs.`);

    if (proxies.length !== privKeys.length || privKeys.length !== okxWallets.length || okxWallets.length !== okxUids.length) {
      console.error('[ERROR] Mismatch in file data lengths. Ensure each file has the same number of lines.');
      return;
    }

    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      let privKey = privKeys[i].trim(); // Ensure no leading/trailing whitespace
      const okxWallet = okxWallets[i];
      const okxUid = okxUids[i];

      console.log(`\n[INFO] Processing NEW ACCOUNT  ${i + 1}...`);
      console.log(`[INFO] Proxy: ${proxy}`);

      // Remove '0x' prefix from the private key if it exists
      if (privKey.startsWith('0x')) {
        privKey = privKey.slice(2);
        console.log(`[INFO] Private key has '0x' prefix, removed. New private key: ${privKey}`);
      }

      // Check if private key length is correct (64 hex characters)
      if (privKey.length !== 64) {
        console.error(`[ERROR] Invalid private key length: ${privKey}`);
        continue; // Skip this entry if private key is invalid
      }

      // Test the proxy before proceeding
      const isProxyValid = await testProxy(proxy);
      if (!isProxyValid) {
        console.error(`[ERROR] Skipping entry ${i + 1} due to invalid proxy.`);
        continue; // Skip to next entry if proxy is invalid
      }

      console.log(`[INFO] Proxy passed. Proceeding with entry ${i + 1}.`);

      try {
        console.log('[INFO] Fetching nonce...');
        const maxRetries = 10; // Set maximum number of retries
        let attempt = 0;
        let nonceResponse = null;
        
        while (attempt < maxRetries) {
          try {
            attempt++;
            console.log(`[INFO] Attempt ${attempt} to fetch nonce...`);
        
            nonceResponse = await fetchWithProxy(
              'https://claims.movementnetwork.xyz/api/get-nonce',
              {
                headers: {
                  'accept': '*/*',
                  'accept-language': 'en-US;q=0.8,en;q=0.7',
                  'dnt': '1',
                  'priority': 'u=1, i',
                  'referer': 'https://claims.movementnetwork.xyz/okx',
                  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
                  'sec-ch-ua-mobile': '?0',
                  'sec-ch-ua-platform': '"Windows"',
                  'sec-fetch-dest': 'empty',
                  'sec-fetch-mode': 'cors',
                  'sec-fetch-site': 'same-origin',
                  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
              },
              proxy
            );
        
            if (nonceResponse && nonceResponse.nonce) {
              console.log('[INFO] Nonce fetched successfully:', nonceResponse.nonce);
              break; // Exit the loop if nonce is fetched successfully
            } else {
              console.warn(`[WARN] Attempt ${attempt} failed. Retrying...`);
            }
          } catch (error) {
            console.error(`[ERROR] Attempt ${attempt} failed with error:`, error);
          }
        
          if (attempt < maxRetries) {
            console.log(`[INFO] Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
          }
        }
        
        if (!nonceResponse || !nonceResponse.nonce) {
          console.error('[ERROR] Failed to fetch nonce after multiple attempts.');
        }

        const nonce = nonceResponse.nonce;
        console.log(`[INFO] Received nonce: ${nonce}`);

        console.log('[INFO] Signing message...');
        const aptosAccount = new AptosAccount(Buffer.from(privKey, 'hex'));
        const publicKey = aptosAccount.pubKey().hexString;
        const address = aptosAccount.address().toString();
        const message = `APTOS\naddress: ${address}\napplication: https://claims.movementnetwork.xyz\nmessage: Please sign this message to confirm ownership. Nonce: ${nonce}\nnonce: ${nonce}`;
        const signature = aptosAccount.signBuffer(Buffer.from(message)).toString('hex');

        console.log(`[INFO] Address: ${address}`);
        console.log(`[DEBUG] Public Key: ${publicKey}`);
        console.log(`[DEBUG] Message: ${message}`);
        console.log(`[DEBUG] Signature: ${signature}`);

        // Log the request body before sending
        const requestBody = {
          okxUid: okxUid,  // your okxUid variable
          okxWallet: okxWallet,  // your okxWallet variable
          walletDetails: {
            address: address,  // your address variable
            message: `APTOS\naddress: ${address}\napplication: https://claims.movementnetwork.xyz\nmessage: Please sign this message to confirm ownership. Nonce: ${nonce}\nnonce: ${nonce}`,  // formatted message
            signature: signature,  // your signature variable
            publicKey: publicKey,  // your publicKey variable
            nonce: nonce,  // your nonce variable
          },
        };



        console.log('[INFO] Sending data to /okx/check...');
        const checkResponse = await fetchWithProxy(
          'https://claims.movementnetwork.xyz/api/okx/check',
          {
            method: 'POST',
            headers: {
              'accept': '*/*',
              'accept-language': 'en-US;q=0.8,en;q=0.7',
              'content-type': 'application/json',
              'dnt': '1',
              'origin': 'https://claims.movementnetwork.xyz',
              'priority': 'u=1, i',
              'referer': 'https://claims.movementnetwork.xyz/okx',
              'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-origin',
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
            data: JSON.stringify(requestBody),
          },
          proxy
        );
        
        
        console.log('[INFO] Response from check:', JSON.stringify(checkResponse, null, 2));

        if (checkResponse) {
          console.log('[INFO] ========================================================================');
          console.log('[SUCCESS] Successfully processed entry.');
        } else {
          console.log('[INFO] ========================================================================');
          console.error('[ERROR] Failed to process entry.');
        }
      } catch (error) {
        console.log('[INFO] ========================================================================');
        console.log('[INFO] NEXT ACCOUNTS STARTING...');
      }
      
      await sleep(5000);
    }
  } catch (error) {
    console.log('[INFO] ========================================================================');
    console.error('[ERROR] Error:', error);
  }
};


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Execute the script
main();
