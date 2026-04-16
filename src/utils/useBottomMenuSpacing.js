import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_MENU_HEIGHT } from "../components/BottomMenu";

export function useBottomMenuSpacing(extra = 24) {
  const insets = useSafeAreaInsets();

  return {
    insets,
    bottomMenuSpace: BOTTOM_MENU_HEIGHT + insets.bottom + extra,
    scrollContentStyle: {
      flexGrow: 1,
      paddingBottom: BOTTOM_MENU_HEIGHT + insets.bottom + extra,
    },
  };
}
