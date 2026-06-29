declare module "expo-router" {
  import type { ComponentType } from "react";

  export const Stack: ComponentType<any>;
}

declare module "react-native-svg" {
  import type { ComponentType } from "react";

  const Svg: ComponentType<any>;
  export const Path: ComponentType<any>;
  export default Svg;
}
