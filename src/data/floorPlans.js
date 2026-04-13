import AthleticGroundPlan from "../assets/floorplans/athletic_ground_with_outline.svg";
import AthleticMezzaninePlan from "../assets/floorplans/athletic_mezzanine_with_outline.svg";
import AthleticFloor1Plan from "../assets/floorplans/athletic_floor1_with_outline.svg";
import AthleticFloor2Plan from "../assets/floorplans/athletic_floor2_with_outline.svg";
import LaresGroundPlan from "../assets/floorplans/lares_ground_with_outline.svg";
import LaresFloor1Plan from "../assets/floorplans/lares_floor1_with_outline.svg";
import LaresFloor2Plan from "../assets/floorplans/lares_floor2_with_outline.svg";
import LaresFloor3Plan from "../assets/floorplans/lares_floor3_with_outline.svg";
import RydalBasementPlan from "../assets/floorplans/rydal_basement_with_outline.svg";
import RydalFloor1Plan from "../assets/floorplans/rydal_floor1_with_outline.svg";
import RydalFloor2Plan from "../assets/floorplans/rydal_floor2_with_outline.svg";
import RydalFloor3Plan from "../assets/floorplans/rydal_floor3_with_outline.svg";
import SpringhouseFloor1Plan from "../assets/floorplans/springhouse_floor1.svg";
import SutherlandFloor1Plan from "../assets/floorplans/sutherland_floor1_with_outline.svg";
import SutherlandFloor2Plan from "../assets/floorplans/sutherland_floor2_with_outline.svg";
import SutherlandFloor3Plan from "../assets/floorplans/sutherland_floor3_with_outline.svg";
import SutherlandFloor4Plan from "../assets/floorplans/sutherland_floor4_with_outline.svg";
import SutherlandFloor5Plan from "../assets/floorplans/sutherland_floor5_with_outline.svg";
import WoodlandGroundPlan from "../assets/floorplans/woodland_ground_with_outline.svg";
import WoodlandFloor1Plan from "../assets/floorplans/woodland_floor1_with_outline.svg";
import WoodlandFloor2Plan from "../assets/floorplans/woodland_floor2_with_outline.svg";
import WoodlandFloor3Plan from "../assets/floorplans/woodland_floor3_with_outline.svg";

export const FLOOR_PLANS = {
  athletic: {
    buildingName: "Athletic Building",
    floors: [
      { id: "ground", label: "Ground", component: AthleticGroundPlan },
      { id: "mezzanine", label: "Mezzanine", component: AthleticMezzaninePlan },
      { id: "1", label: "Floor 1", component: AthleticFloor1Plan },
      { id: "2", label: "Floor 2", component: AthleticFloor2Plan },
    ],
  },
  lares: {
    buildingName: "Lares Building",
    floors: [
      { id: "ground", label: "Ground", component: LaresGroundPlan },
      { id: "1", label: "Floor 1", component: LaresFloor1Plan },
      { id: "2", label: "Floor 2", component: LaresFloor2Plan },
      { id: "3", label: "Floor 3", component: LaresFloor3Plan },
    ],
  },
  rydal: {
    buildingName: "Rydal Building",
    floors: [
      { id: "basement", label: "Basement", component: RydalBasementPlan },
      { id: "1", label: "Floor 1", component: RydalFloor1Plan },
      { id: "2", label: "Floor 2", component: RydalFloor2Plan },
      { id: "3", label: "Floor 3", component: RydalFloor3Plan },
    ],
  },
  springhouse: {
    buildingName: "Springhouse",
    floors: [{ id: "1", label: "Floor 1", component: SpringhouseFloor1Plan }],
  },
  sutherland: {
    buildingName: "Sutherland Hall",
    floors: [
      { id: "1", label: "Floor 1", component: SutherlandFloor1Plan },
      { id: "2", label: "Floor 2", component: SutherlandFloor2Plan },
      { id: "3", label: "Floor 3", component: SutherlandFloor3Plan },
      { id: "4", label: "Floor 4", component: SutherlandFloor4Plan },
      { id: "5", label: "Floor 5", component: SutherlandFloor5Plan },
    ],
  },
  woodland: {
    buildingName: "Woodland Building",
    floors: [
      { id: "ground", label: "Ground", component: WoodlandGroundPlan },
      { id: "1", label: "Floor 1", component: WoodlandFloor1Plan },
      { id: "2", label: "Floor 2", component: WoodlandFloor2Plan },
      { id: "3", label: "Floor 3", component: WoodlandFloor3Plan },
    ],
  },
};

export function getFloorPlanConfig(buildingId) {
  return FLOOR_PLANS[String(buildingId || "").toLowerCase()] || null;
}
