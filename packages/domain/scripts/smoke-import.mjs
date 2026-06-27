import assert from "node:assert/strict";
import * as domain from "@bie-rang-wo-xiaoshi/domain";

const expectedFunctions = [
  "getExpiresAt",
  "getRemainingSeconds",
  "reviewShortNote",
  "canSendInvite",
];

for (const exportName of expectedFunctions) {
  assert.equal(
    typeof domain[exportName],
    "function",
    `${exportName} must be exported as a function`,
  );
}

const expectedArrays = ["messageTemplates", "deliveryChannels", "deliveryStatuses"];

for (const exportName of expectedArrays) {
  assert.equal(
    Array.isArray(domain[exportName]),
    true,
    `${exportName} must be exported as an array`,
  );
}
