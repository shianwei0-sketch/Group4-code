import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { network } from "hardhat";

describe("Payment", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner] = await viem.getWalletClients();
  
  // Create test accounts for payers
  const payer1PrivateKey = generatePrivateKey();
  const payer2PrivateKey = generatePrivateKey();
  const payer1 = privateKeyToAccount(payer1PrivateKey);
  const payer2 = privateKeyToAccount(payer2PrivateKey);

  it("Should deploy Payment contract", async function () {
    const payment = await viem.deployContract("Payment");
    assert.ok(payment.address, "Contract should be deployed");
  });

  it("Should record payment with order ID, amount, payer address, and timestamp", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      // fund a bit more than `amount` to cover gas
      value: amount * 2n,
    });
    await payment.write.pay([orderId], { value: amount, account: payer1 });

    const [storedOrderId, storedAmount, payer, timestamp] =
      await payment.read.getPayment([orderId]);

    assert.equal(storedOrderId, orderId, "Order ID should match");
    assert.equal(storedAmount, amount, "Amount should match");
    assert.equal(
      getAddress(payer),
      getAddress(payer1.address),
      "Payer address should match"
    );
    assert.ok(timestamp > 0n, "Timestamp should be set");

    const totalReceived = await payment.read.totalReceived();
    assert.equal(totalReceived, amount, "Total received should match");
  });

  it("Should record multiple payments correctly", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId1 = "order1";
    const orderId2 = "order2";
    const amount1 = parseEther("1");
    const amount2 = parseEther("2");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount1 + amount2,
    });

    await payment.write.pay([orderId1], { value: amount1, account: payer1 });
    await payment.write.pay([orderId2], { value: amount2, account: payer1 });

    const totalReceived = await payment.read.totalReceived();
    assert.equal(totalReceived, amount1 + amount2, "Total should match");

    const paymentCount = await payment.read.getPaymentCount();
    assert.equal(paymentCount, 2n, "Payment count should be 2");
  });

  it("Should revert when paying with duplicate order ID", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount * 2n,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    await assert.rejects(
      payment.write.pay([orderId], { value: amount, account: payer1 }),
      /Payment: order ID already exists/
    );
  });

  it("Should revert when paying with zero amount", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";

    await assert.rejects(
      payment.write.pay([orderId], { value: 0n, account: payer1 }),
      /Payment: amount must be greater than 0/
    );
  });

  it("Should allow owner to withdraw specified amount", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");
    const withdrawAmount = parseEther("0.5");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    const ownerBalanceBefore = await publicClient.getBalance({
      address: owner.account.address,
    });
    await payment.write.withdraw([withdrawAmount]);

    const ownerBalanceAfter = await publicClient.getBalance({
      address: owner.account.address,
    });

    assert.ok(
      ownerBalanceAfter > ownerBalanceBefore,
      "Owner balance should increase"
    );

    const contractBalance = await publicClient.getBalance({
      address: payment.address,
    });
    assert.equal(
      contractBalance,
      amount - withdrawAmount,
      "Contract balance should decrease"
    );
  });

  it("Should allow owner to withdraw all balance", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    const contractBalanceBefore = await publicClient.getBalance({
      address: payment.address,
    });
    await payment.write.withdrawAll();

    const contractBalanceAfter = await publicClient.getBalance({
      address: payment.address,
    });

    assert.equal(contractBalanceAfter, 0n, "Contract balance should be zero");
  });

  it("Should revert when non-owner tries to withdraw", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    await assert.rejects(
      payment.write.withdraw([parseEther("0.5")], {
        account: payer1,
      }),
      /OwnableUnauthorizedAccount/
    );
  });

  it("Should revert when withdrawing more than contract balance", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    await assert.rejects(
      payment.write.withdraw([parseEther("2")]),
      /Payment: insufficient contract balance/
    );
  });

  it("Should revert when withdrawing zero amount", async function () {
    const payment = await viem.deployContract("Payment");

    await assert.rejects(
      payment.write.withdraw([0n]),
      /Payment: amount must be greater than 0/
    );
  });

  it("Should revert when getting payment for non-existent order ID", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "nonexistent";

    await assert.rejects(
      payment.read.getPayment([orderId]),
      /Payment: order ID does not exist/
    );
  });

  it("Should prevent reentrancy attacks", async function () {
    const payment = await viem.deployContract("Payment");
    const orderId = "order1";
    const amount = parseEther("1");

    // Fund payer1 account
    await owner.sendTransaction({
      to: payer1.address,
      value: amount,
    });

    await payment.write.pay([orderId], { value: amount, account: payer1 });

    // Withdraw should be protected by ReentrancyGuard
    await payment.write.withdraw([parseEther("0.5")]);
    await payment.write.withdraw([parseEther("0.5")]);
  });
});

