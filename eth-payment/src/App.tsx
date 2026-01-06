import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { PaymentService, type PaymentRecord } from './PaymentService';
import { PAYMENT_CONTRACT_ADDRESS } from './ethConfig';

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [paymentOrderId, setPaymentOrderId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0.01');
  const [queryOrderId, setQueryOrderId] = useState('');
  const [queriedPayment, setQueriedPayment] = useState<PaymentRecord | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [events, setEvents] = useState<PaymentRecord[]>([]);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);
  const [accountBalance, setAccountBalance] = useState<bigint | null>(null);

  const service = useMemo(() => new PaymentService(), []);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    let active = true;

    (async () => {
      try {
        const fn = await service.onPaymentReceived((record) => {
          if (!active) return;
          setEvents((prev) => [record, ...prev.slice(0, 9)]);
        });
        if (active) {
          unsubscribe = fn;
        } else {
          // If component unmounts before subscription completes, clean up immediately
          fn();
        }
      } catch (e) {
        // Ignore when contract not initialized or user not connected
        console.error('Failed to subscribe to PaymentReceived event:', e);
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const loadBalance = async () => {
    try {
      const [contract, account] = await Promise.all([
        service.getContractBalance(),
        service.getAccountBalance(),
      ]);
      setContractBalance(contract);
      setAccountBalance(account);
    } catch (e: any) {
      // Fail silently, don't affect other functionality
      console.error('Failed to get balance:', e);
    }
  };

  const handleConnect = async () => {
    try {
      setStatus('Connecting wallet...');
      const addr = await service.connectWallet();
      setAccount(addr);
      setStatus('Wallet connected');
      await loadBalance();
    } catch (e: any) {
      setStatus(e.message ?? String(e));
    }
  };

  const handlePay = async () => {
    try {
      if (!paymentOrderId || !paymentAmount) {
        setStatus('Please enter order ID and amount');
        return;
      }
      setStatus('Sending transaction...');
      await service.pay(paymentOrderId, paymentAmount);
      setStatus('Payment successful, waiting for event update');
      await loadBalance();
    } catch (e: any) {
      setStatus(e.message ?? String(e));
    }
  };

  const handleQuery = async () => {
    try {
      if (!queryOrderId) {
        setStatus('Please enter order ID to query');
        return;
      }
      setStatus('Querying...');
      const record = await service.getPayment(queryOrderId);
      if (!record) {
        setQueriedPayment(null);
        setStatus('Order not found');
      } else {
        setQueriedPayment(record);
        setStatus('Query successful');
      }
    } catch (e: any) {
      setStatus(e.message ?? String(e));
    }
  };

  const handleWithdraw = async () => {
    try {
      if (!withdrawAmount) {
        setStatus('Please enter withdrawal amount (ETH)');
        return;
      }
      setStatus('Withdrawal transaction sending...');
      await service.withdraw(withdrawAmount);
      setStatus('Withdrawal transaction submitted');
      await loadBalance();
    } catch (e: any) {
      setStatus(e.message ?? String(e));
    }
  };

  const handleWithdrawAll = async () => {
    try {
      setStatus('All withdrawal transaction sending...');
      await service.withdrawAll();
      setStatus('All withdrawal transaction submitted');
      await loadBalance();
    } catch (e: any) {
      setStatus(e.message ?? String(e));
    }
  };

  const formatEth = (wei: bigint) => {
    const eth = Number(wei) / 1e18;
    return `${eth}`;
  };

  const formatTime = (ts: bigint) => {
    return new Date(Number(ts) * 1000).toLocaleString();
  };

  const explorerUrl = PAYMENT_CONTRACT_ADDRESS
    ? `https://sepolia.etherscan.io/address/${PAYMENT_CONTRACT_ADDRESS}`
    : '';

  return (
    <div className="app-root">
      <div className="app">
        <header className="app-header">
          <div>
            <h1>Eth Payment DApp</h1>
            <p>{account ? `Current account: ${account}` : 'Wallet not connected'}</p>
          </div>
          <div className="header-actions">
            <button onClick={handleConnect}>Connect MetaMask</button>
            <p className="status">{status}</p>
          </div>
        </header>

        <main className="app-main">
          <div className="app-left">
            <section>
              <h2>Links</h2>
              <a
                href={explorerUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="link-button"
              >
                View Contract (Etherscan)
              </a>
            </section>

            <section>
              <h2>Balance</h2>
              {accountBalance !== null && (
                <p>Account Balance: {formatEth(accountBalance)} ETH</p>
              )}
              {contractBalance !== null && (
                <div className="balance-card">
                  <h3>Contract Balance</h3>
                  <p className="balance-amount">
                    {formatEth(contractBalance)} ETH
                  </p>
                  <button onClick={loadBalance} className="refresh-btn">
                    Refresh Balance
                  </button>
                </div>
              )}
            </section>

            <section>
              <h2>Recent PaymentReceived Events</h2>
              {events.length === 0 && <p>No events</p>}
              {events.map((e, idx) => (
                <div key={`${e.orderId}-${idx}`} className="card">
                  <p>Order ID: {e.orderId}</p>
                  <p>Amount: {formatEth(e.amount)} ETH</p>
                  <p>Payer: {e.payer}</p>
                  <p>Time: {formatTime(e.timestamp)}</p>
                </div>
              ))}
            </section>
          </div>

          <div className="app-right">
            <section>
              <h2>Payment</h2>
              <div>
                <label>
                  Order ID:
                  <input
                    value={paymentOrderId}
                    onChange={(e) => setPaymentOrderId(e.target.value)}
                    placeholder="e.g.: order-001"
                  />
                </label>
              </div>
              <div>
                <label>
                  Amount (ETH):
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.01"
                  />
                </label>
              </div>
              <button onClick={handlePay}>Pay</button>
            </section>

            <section>
              <h2>Order Query</h2>
              <div>
                <label>
                  Order ID:
                  <input
                    value={queryOrderId}
                    onChange={(e) => setQueryOrderId(e.target.value)}
                    placeholder="order-001"
                  />
                </label>
              </div>
              <button onClick={handleQuery}>Query</button>
              {queriedPayment && (
                <div className="card">
                  <p>Order ID: {queriedPayment.orderId}</p>
                  <p>Amount: {formatEth(queriedPayment.amount)} ETH</p>
                  <p>Payer: {queriedPayment.payer}</p>
                  <p>Time: {formatTime(queriedPayment.timestamp)}</p>
                </div>
              )}
            </section>

            <section>
              <h2>Withdraw (Contract Owner Only)</h2>
              <div>
                <label>
                  Amount (ETH):
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.01"
                  />
                </label>
              </div>
              <button onClick={handleWithdraw}>Withdraw Specified Amount</button>
              <button onClick={handleWithdrawAll}>Withdraw All</button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
