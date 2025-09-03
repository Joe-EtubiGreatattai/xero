const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const xero = require('./xeroClient');

dotenv.config();
const app = express();
app.use(express.json());

// Welcome route to avoid default "Cannot GET /" message
app.get('/', (req, res) => {
  res.send('👋 Welcome to the Xero Integration API! Use /connect to get started.');
});

let tenantId = null;

// Connect user to Xero
app.get('/connect', async (req, res) => {
  const consentUrl = await xero.buildConsentUrl();
  console.log(`Redirecting to Xero consent URL: ${consentUrl}`); // Log the redirect URI
  res.redirect(consentUrl);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const tokenSet = await xero.apiCallback(req.url);
  await xero.updateTenants();
  tenantId = xero.tenants[0].tenantId;
  res.send('✅ Xero connected successfully!');
});

// Create invoice
exports.createInvoice = async (req, res) => {
  try {
    const tenantId = xero.tenants[0]?.tenantId;
    if (!tenantId) throw new Error('Tenant ID not found. Please connect to Xero.');

    const { contactName, description, quantity, unitAmount, accountCode } = req.body;

    const result = await xero.accountingApi.createInvoices(tenantId, {
      invoices: [{
        type: 'ACCREC',
        contact: { name: contactName },
        lineItems: [{
          description,
          quantity,
          unitAmount,
          accountCode
        }],
        date: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        status: 'AUTHORISED'
      }]
    });

    res.json(result.body.invoices[0]);
  } catch (err) {
    console.error('Create Invoice Error:', err.response?.body || err.message);
    res.status(500).send('Error creating invoice');
  }
};


// Get all invoices
app.get('/invoice', async (req, res) => {
  try {
    const result = await xero.accountingApi.getInvoices(tenantId);
    res.json(result.body.invoices);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error fetching invoices');
  }
});

// SSL options
const sslOptions = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// HTTPS server
https.createServer(sslOptions, app).listen(443, () => {
  console.log(`✅ HTTPS Server running at https://localhost`);
});

// Redirect HTTP to HTTPS
http.createServer((req, res) => {
  res.writeHead(301, {
    Location: `https://${req.headers.host}${req.url}`
  });
  res.end();
}).listen(80, () => {
  console.log(`🌐 HTTP server redirecting to HTTPS`);
});
