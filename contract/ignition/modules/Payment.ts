import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PaymentModule", (m) => {
  const payment = m.contract("Payment");

  return { payment };
});

