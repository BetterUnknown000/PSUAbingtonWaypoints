// app/building/[id].tsx
import { useLocalSearchParams } from "expo-router";
import BuildingDetail from "@/pages/BuildingDetail";

export default function BuildingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BuildingDetail route={{ params: { buildingId: id } }} />;
}
