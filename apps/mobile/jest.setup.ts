// React Native Testing Library registers its Jest matchers from test imports.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest"),
);
