import {FrameBackground} from "../components/frame-background.js";
import {Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";

export function HomePage({model}: {model: HomeViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#05080a">
      <FrameBackground />
      <Text style={{x: 0, y: 25, width: 240, height: 25, fontSize: 20, color: "#acc8c2", alignItems: "center"}}>
        {`${model.copy.dateText}  ${model.copy.weekdayText}`}
      </Text>
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} />
      ))}
      <Text style={{x: 0, y: 140, width: 240, height: 24, fontSize: 18, color: "#cee8de", alignItems: "center"}}>
        {model.copy.greeting}
      </Text>
      <Text style={{x: 0, y: 166, width: 240, height: 20, fontSize: 16, color: "#7c9c9e", alignItems: "center"}}>
        {model.copy.subtitle}
      </Text>
    </Screen>
  );
}

function ClockGlyph({glyph}: {glyph: ClockFlipGlyphViewModel}) {
  if (glyph.previousChar === glyph.char) {
    return (
      <Text style={{x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, fontSize: glyph.fontSize, color: glyph.color, alignItems: "center"}}>
        {glyph.char}
      </Text>
    );
  }

  const eased = 1 - Math.pow(1 - glyph.progress, 3);
  const travel = glyph.height * 0.38;
  const muted = mixColor(glyph.color, "#05080a", 0.72);
  return (
    <>
      <Text style={{x: glyph.x, y: glyph.y - Math.round(travel * eased), width: glyph.width, height: glyph.height, fontSize: glyph.fontSize, color: mixColor(glyph.color, muted, eased), alignItems: "center"}}>
        {glyph.previousChar}
      </Text>
      <Text style={{x: glyph.x, y: glyph.y + Math.round(travel * (1 - eased)), width: glyph.width, height: glyph.height, fontSize: glyph.fontSize, color: mixColor(muted, glyph.color, eased), alignItems: "center"}}>
        {glyph.char}
      </Text>
    </>
  );
}
