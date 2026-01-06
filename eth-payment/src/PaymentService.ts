import { BrowserProvider, Contract, JsonRpcSigner, parseEther } from 'ethers';
import { PAYMENT_CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from './ethConfig';
import paymentArtifact from '../../contract/artifacts/contracts/Payment.sol/Payment.json';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type PaymentRecord = {
  orderId: string;
  amount: bigint;
  payer: string;
  timestamp: bigint;
};

export class PaymentService {
  private provider?: BrowserProvider;
  private signer?: JsonRpcSigner;
  private contract?: Contract;

  async init() {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }
    this.provider = new BrowserProvider(window.ethereum);
    const network = await this.provider.getNetwork();
    console.log('network', network);
    if (network.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
      throw new Error('Please switch to Sepolia network');
    }
    this.signer = await this.provider.getSigner();
    this.contract = new Contract(
      PAYMENT_CONTRACT_ADDRESS,
      paymentArtifact.abi,
      this.signer,
    );
  }

  async connectWallet(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }
    const accounts: string[] = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }
    await this.init();
    return accounts[0];
  }

  async ensureReady() {
    if (!this.contract || !this.signer || !this.provider) {
      await this.init();
    }
  }

  async pay(orderId: string, amountEth: string) {
    await this.ensureReady();
    if (!this.contract) throw new Error('Contract not initialized');
    const value = parseEther(amountEth);
    const tx = await this.contract.pay(orderId, { value });
    return await tx.wait();
  }

  async withdraw(amountEth: string) {
    await this.ensureReady();
    if (!this.contract) throw new Error('Contract not initialized');
    const value = parseEther(amountEth);
    const tx = await this.contract.withdraw(value);
    return await tx.wait();
  }

  async withdrawAll() {
    await this.ensureReady();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.withdrawAll();
    return await tx.wait();
  }

  async getPayment(orderId: string): Promise<PaymentRecord | null> {
    await this.ensureReady();
    if (!this.contract) throw new Error('Contract not initialized');
    try {
      const [id, amount, payer, ts] = await this.contract.getPayment(orderId);
      return {
        orderId: id,
        amount,
        payer,
        timestamp: ts,
      };
    } catch {
      return null;
    }
  }

  async getContractBalance(): Promise<bigint> {
    await this.ensureReady();
    if (!this.provider) throw new Error('Provider not initialized');
    const balance = await this.provider.getBalance(PAYMENT_CONTRACT_ADDRESS);
    console.log('Contract balance:', balance);
    return balance;
  }

  async getAccountBalance(): Promise<bigint> {
    await this.ensureReady();
    if (!this.provider || !this.signer) {
      throw new Error('Provider or Signer not initialized');
    }
    const address = await this.signer.getAddress();
    const balance = await this.provider.getBalance(address);
    console.log('Account balance:', balance);
    return balance;
  }

  async onPaymentReceived(
    handler: (record: PaymentRecord) => void,
  ): Promise<() => void> {
    await this.ensureReady();
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }
    const listener = (
      orderId: any,
      amount: bigint,
      payer: string,
      timestamp: bigint,
    ) => {
      const normalizedOrderId =
        typeof orderId === 'string'
          ? orderId
          : orderId?.hash ?? String(orderId);
      handler({ orderId: normalizedOrderId, amount, payer, timestamp });
    };
    this.contract.on('PaymentReceived', listener);
    return () => {
      this.contract?.off('PaymentReceived', listener);
    };
  }
}


