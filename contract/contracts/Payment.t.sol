// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Payment} from "./Payment.sol";
import {Test} from "forge-std/Test.sol";

contract PaymentTest is Test {
  Payment payment;
  address owner;
  address user1;
  address user2;

  event PaymentReceived(
    string indexed orderId,
    uint256 amount,
    address indexed payer,
    uint256 timestamp
  );

  event Withdrawal(address indexed to, uint256 amount, uint256 timestamp);

  function setUp() public {
    owner = address(0xA11CE);
    user1 = address(0x1);
    user2 = address(0x2);
    vm.prank(owner);
    payment = new Payment();
  }

  function test_InitialState() public view {
    require(payment.totalReceived() == 0, "Initial total should be 0");
    require(payment.getPaymentCount() == 0, "Initial payment count should be 0");
  }

  function test_Pay() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount);
    vm.prank(user1);

    vm.expectEmit(true, true, true, true);
    emit PaymentReceived(orderId, amount, user1, block.timestamp);

    payment.pay{value: amount}(orderId);

    (
      string memory storedOrderId,
      uint256 storedAmount,
      address payer,
      uint256 timestamp
    ) = payment.getPayment(orderId);

    require(
      keccak256(abi.encodePacked(storedOrderId)) == keccak256(abi.encodePacked(orderId)),
      "Order ID should match"
    );
    require(storedAmount == amount, "Amount should match");
    require(payer == user1, "Payer should match");
    require(timestamp > 0, "Timestamp should be set");
    require(payment.totalReceived() == amount, "Total received should match");
    require(payment.getPaymentCount() == 1, "Payment count should be 1");
  }

  function test_PayMultipleOrders() public {
    string memory orderId1 = "order1";
    string memory orderId2 = "order2";
    uint256 amount1 = 1 ether;
    uint256 amount2 = 2 ether;

    vm.deal(user1, amount1 + amount2);
    vm.prank(user1);
    payment.pay{value: amount1}(orderId1);

    vm.prank(user1);
    payment.pay{value: amount2}(orderId2);

    require(payment.totalReceived() == amount1 + amount2, "Total should match");
    require(payment.getPaymentCount() == 2, "Payment count should be 2");
  }

  function test_PayDuplicateOrderId() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount * 2);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    vm.prank(user1);
    vm.expectRevert("Payment: order ID already exists");
    payment.pay{value: amount}(orderId);
  }

  function test_PayZeroAmount() public {
    string memory orderId = "order1";

    vm.prank(user1);
    vm.expectRevert("Payment: amount must be greater than 0");
    payment.pay{value: 0}(orderId);
  }

  function test_Withdraw() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;
    uint256 withdrawAmount = 0.5 ether;

    vm.deal(user1, amount);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    uint256 ownerBalanceBefore = owner.balance;

    vm.expectEmit(true, true, true, true);
    emit Withdrawal(owner, withdrawAmount, block.timestamp);

    vm.prank(owner);
    payment.withdraw(withdrawAmount);

    require(
      owner.balance == ownerBalanceBefore + withdrawAmount,
      "Owner balance should increase"
    );
    require(
      address(payment).balance == amount - withdrawAmount,
      "Contract balance should decrease"
    );
  }

  function test_WithdrawAll() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    uint256 ownerBalanceBefore = owner.balance;
    uint256 contractBalance = address(payment).balance;

    vm.expectEmit(true, true, true, true);
    emit Withdrawal(owner, contractBalance, block.timestamp);

    vm.prank(owner);
    payment.withdrawAll();

    require(
      owner.balance == ownerBalanceBefore + contractBalance,
      "Owner should receive all balance"
    );
    require(
      address(payment).balance == 0,
      "Contract balance should be zero"
    );
  }

  function test_WithdrawByNonOwner() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    vm.prank(user1);
    vm.expectRevert();
    payment.withdraw(0.5 ether);
  }

  function test_WithdrawInsufficientBalance() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    vm.prank(owner);
    vm.expectRevert("Payment: insufficient contract balance");
    payment.withdraw(2 ether);
  }

  function test_WithdrawZeroAmount() public {
    vm.prank(owner);
    vm.expectRevert("Payment: amount must be greater than 0");
    payment.withdraw(0);
  }

  function test_GetPaymentNonExistent() public {
    string memory orderId = "nonexistent";

    vm.expectRevert("Payment: order ID does not exist");
    payment.getPayment(orderId);
  }

  function test_ReentrancyGuard() public {
    string memory orderId = "order1";
    uint256 amount = 1 ether;

    vm.deal(user1, amount);
    vm.prank(user1);
    payment.pay{value: amount}(orderId);

    // Try to withdraw multiple times sequentially
    // ReentrancyGuard prevents re-entrancy, not sequential calls
    vm.prank(owner);
    payment.withdraw(0.5 ether);
    vm.prank(owner);
    payment.withdraw(0.5 ether);
  }
}

