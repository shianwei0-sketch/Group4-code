// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Payment is Ownable, ReentrancyGuard {
  struct PaymentRecord {
    string orderId;
    uint256 amount;
    address payer;
    uint256 timestamp;
  }

  mapping(string => PaymentRecord) public payments;
  string[] public paymentOrderIds;
  uint256 public totalReceived;

  event PaymentReceived(
    string orderId,
    uint256 amount,
    address indexed payer,
    uint256 timestamp
  );

  event Withdrawal(address indexed to, uint256 amount, uint256 timestamp);

  constructor() Ownable(msg.sender) {}

  function pay(string calldata orderId) public payable nonReentrant {
    require(msg.value > 0, "Payment: amount must be greater than 0");
    require(bytes(orderId).length > 0, "Payment: order ID must not be empty");
    require(
      payments[orderId].amount == 0,
      "Payment: order ID already exists"
    );

    payments[orderId] = PaymentRecord({
      orderId: orderId,
      amount: msg.value,
      payer: msg.sender,
      timestamp: block.timestamp
    });

    paymentOrderIds.push(orderId);
    totalReceived += msg.value;

    emit PaymentReceived(orderId, msg.value, msg.sender, block.timestamp);
  }

  function withdraw(uint256 amount) public onlyOwner nonReentrant {
    require(amount > 0, "Payment: amount must be greater than 0");
    require(
      amount <= address(this).balance,
      "Payment: insufficient contract balance"
    );

    (bool success, ) = owner().call{value: amount}("");
    require(success, "Payment: withdrawal failed");

    emit Withdrawal(owner(), amount, block.timestamp);
  }

  function withdrawAll() public onlyOwner nonReentrant {
    uint256 balance = address(this).balance;
    require(balance > 0, "Payment: no balance to withdraw");

    (bool success, ) = owner().call{value: balance}("");
    require(success, "Payment: withdrawal failed");

    emit Withdrawal(owner(), balance, block.timestamp);
  }

  function getPayment(string calldata orderId)
    public
    view
    returns (
      string memory,
      uint256,
      address,
      uint256
    )
  {
    PaymentRecord memory payment = payments[orderId];
    require(
      payment.amount != 0,
      "Payment: order ID does not exist"
    );
    return (payment.orderId, payment.amount, payment.payer, payment.timestamp);
  }

  function getPaymentCount() public view returns (uint256) {
    return paymentOrderIds.length;
  }

  receive() external payable {
    revert("Payment: use pay() function to send payments");
  }

  fallback() external payable {
    revert("Payment: use pay() function to send payments");
  }
}

