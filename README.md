# White Market Trading Hub

A marketplace for buying and selling online, with payments held in a blockchain escrow until the buyer confirms they got the item. Built to cut down on the "paid, then got blocked" scams that happen when trading through social media.

## Features

- **Wallet login** — sign in with MetaMask by signing a nonce. No passwords are stored.
- **Seller verification (KYC)** — sellers upload an ID, admins approve it, and verified sellers get a badge.
- **Escrow payments** — the buyer's payment is locked in a Solidity smart contract and released to the seller once the buyer confirms receipt.
- **Disputes** — either side can open a dispute and upload evidence. An admin can then refund the buyer, release funds to the seller, or settle partially.
- **Listings and reviews** — product listings with images, plus seller ratings.
- **Admin dashboard** — KYC review, dispute handling and transaction monitoring.

## Tech stack

| Layer | Tools |
|---|---|
| Backend | Python, Django, Django REST Framework, SimpleJWT |
| Database | PostgreSQL |
| Blockchain | Solidity, Hardhat, web3.py |
| Frontend | HTML, CSS, vanilla JS, Three.js |
| Deployment | Docker Compose, Gunicorn, Nginx |

## Project structure

```
blockchain/   Hardhat project: Escrow.sol contract, deploy script, tests
core/         Django app: models, API views, serializers, web3 service
tradinghub/   Django project settings and URLs
frontend/     Static single-page frontend
nginx/        Reverse proxy config
```

## Getting started

### With Docker

```bash
docker compose --profile dev up --build
```

This starts PostgreSQL, the Django backend, Nginx (http://localhost) and a local Hardhat node on port 8545. Deploy the contract to that node (see below) and set `ESCROW_CONTRACT_ADDRESS`.

### Manually

1. Install Python 3.12+, Node.js 20+ and PostgreSQL.
2. Set up the backend:
   ```bash
   python -m venv venv
   venv\Scripts\activate        # Windows
   source venv/bin/activate     # Linux / macOS
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root (see the variables listed below).
4. Run the migrations and start the server:
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```
5. Start the blockchain in a second terminal:
   ```bash
   cd blockchain
   npm install
   npx hardhat node
   ```
6. Deploy the escrow contract in a third terminal, then copy the printed address into `.env`:
   ```bash
   cd blockchain
   npx hardhat run scripts/deploy.js --network localhost
   ```
7. Serve the `frontend/` folder and connect MetaMask to `http://127.0.0.1:8545` (chain ID 31337).

### Environment variables

| Variable | Description |
|---|---|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` for development |
| `ALLOWED_HOSTS` | Comma-separated hostnames |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL connection settings |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `WEB3_PROVIDER_URL` | Ethereum RPC URL (default `http://127.0.0.1:8545`) |
| `ESCROW_CONTRACT_ADDRESS` | Deployed escrow contract address |
| `ARBITER_PRIVATE_KEY` | Key of the arbiter account used to resolve disputes on-chain |

Never commit your `.env` file.

## Tests

```bash
python manage.py test core --settings=tradinghub.test_settings
cd blockchain && npx hardhat test
```

## API overview

All endpoints are under `/api/`. They are grouped into auth (`auth/nonce`, `auth/verify`, `auth/profile`), KYC, products, orders, escrow (`orders/<id>/escrow/...`), disputes, reviews and admin. See `core/urls.py` for the full list.
