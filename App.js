import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import SearchPage from "./src/pages/SearchPage";
import Buildings from "./src/pages/Buildings";
import BuildingDetail from "./src/pages/BuildingDetail";
import NavigationPage from "./src/pages/NavigationPage";
import MapView from "./src/pages/MapView";
import FloorMapScreen from "./src/pages/FloorMapScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Search"
        screenOptions={{
          headerStyle: { backgroundColor: "#001E44" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: "#F5F7FA" },
        }}
      >
        <Stack.Screen
          name="Search"
          component={SearchPage}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Buildings"
          component={Buildings}
          options={{ title: "Campus Buildings" }}
        />

        <Stack.Screen
          name="BuildingDetail"
          component={BuildingDetail}
          options={{ title: "Building Info" }}
        />

        <Stack.Screen
          name="Navigation"
          component={NavigationPage}
          options={{ title: "Navigation" }}
        />

        <Stack.Screen
          name="MapView"
          component={MapView}
          options={{ title: "Campus Map" }}
        />

        <Stack.Screen
          name="FloorMap"
          component={FloorMapScreen}
          options={{ title: "Floor Maps" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}