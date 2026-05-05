#!/bin/bash
# Generate self-signed CA + server + client certs for mTLS testing.
# Run: bash tls/gen-certs.sh
set -e
cd "$(dirname "$0")"
rm -f *.pem *.csr *.srl 2>/dev/null

# 1. CA
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca-key.pem -out ca-cert.pem \
  -days 365 -subj "/CN=NATS Test CA"

# 2. Server cert (CN=localhost, SAN=localhost,127.0.0.1)
openssl req -newkey rsa:2048 -nodes -keyout server-key.pem -out server.csr \
  -subj "/CN=localhost"
cat > server-ext.cnf << 'CNF'
subjectAltName = DNS:localhost, IP:127.0.0.1
extendedKeyUsage = serverAuth, clientAuth
CNF
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -days 365 -extfile server-ext.cnf

# 3. Client cert (CN=app)
openssl req -newkey rsa:2048 -nodes -keyout client-key.pem -out client.csr \
  -subj "/CN=app"
cat > client-ext.cnf << 'CNF'
extendedKeyUsage = clientAuth
CNF
openssl x509 -req -in client.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out client-cert.pem -days 365 -extfile client-ext.cnf

# Cleanup intermediate files
rm -f *.csr *.cnf *.srl
echo "Generated: ca-cert.pem, server-{cert,key}.pem, client-{cert,key}.pem"
