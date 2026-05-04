import {FrameBackground} from "../components/frame-background.js";
import {Screen, Text} from "../components/primitives.js";
import type {HomeViewModel} from "../models/view-model.js";

export function HomePage({model}: {model: HomeViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#05080a">
      <FrameBackground />
      <Text style={{x: 0, y: 25, width: 240, height: 25, fontSize: 20, color: "#acc8c2", alignItems: "center"}}>
        {`${model.copy.dateText}  ${model.copy.weekdayText}`}
      </Text>
      <Text style={{x: 22, y: 68, width: 154, height: 62, fontSize: 52, color: "#f0f8ee"}}>{model.copy.timeText}</Text>
      <Text style={{x: 174, y: 92, width: 48, height: 24, fontSize: 18, color: "#80dac6"}}>{model.copy.secondsText}</Text>
      <Text style={{x: 0, y: 140, width: 240, height: 24, fontSize: 18, color: "#cee8de", alignItems: "center"}}>
        {model.copy.greeting}
      </Text>
      <Text style={{x: 0, y: 166, width: 240, height: 20, fontSize: 16, color: "#7c9c9e", alignItems: "center"}}>
        {model.copy.subtitle}
      </Text>
    </Screen>
  );
}
