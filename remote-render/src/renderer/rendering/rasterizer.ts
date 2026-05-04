import {createCanvas, type SKRSContext2D} from "@napi-rs/canvas";
import type React from "react";
import Yoga, {Align, Direction, FlexDirection, Justify, PositionType} from "yoga-layout";
import type {Node as YogaNode} from "yoga-layout";

import {SCREEN_HEIGHT, SCREEN_WIDTH} from "../constants.js";
import {HostNode, HostText, renderReactElement} from "../host/reconciler.js";
import {fontFamily} from "../services/font-registry.js";
import type {CanvasImage, Style} from "../types.js";

interface LayoutNode {
  host: HostNode | HostText;
  style: Style;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

export function rasterizeElement(element: React.ReactElement, fontKey: string): CanvasImage {
  const root = renderReactElement(element);
  return rasterHostTree(root.children.filter((child): child is HostNode => child instanceof HostNode), fontKey);
}

function rasterHostTree(children: HostNode[], fontKey: string): CanvasImage {
  const canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  for (const child of children) {
    const layout = layoutHostNode(child, ctx, fontKey);
    paintLayout(ctx, layout, 0, 0, fontFamily(fontKey));
  }
  return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, rgba: Buffer.from(canvas.data())};
}

function layoutHostNode(host: HostNode, ctx: SKRSContext2D, fontKey: string): LayoutNode {
  const yoga = buildYogaTree(host, ctx, fontKey);
  yoga.calculateLayout(SCREEN_WIDTH, SCREEN_HEIGHT, Direction.LTR);
  const layout = readLayout(host, yoga);
  yoga.freeRecursive();
  return layout;
}

function buildYogaTree(host: HostNode, ctx: SKRSContext2D, fontKey: string): YogaNode {
  const yoga = Yoga.Node.create();
  const parentStyle = styleOf(host);
  applyYogaStyle(yoga, parentStyle, host.type);
  for (const child of host.children) {
    let childYoga: YogaNode;
    if (child instanceof HostText) {
      childYoga = Yoga.Node.create();
      ctx.font = `${parentStyle.fontSize ?? 16}px ${parentStyle.fontFamily ?? fontFamily(fontKey)}`;
      const metrics = ctx.measureText(child.text);
      childYoga.setWidth(Math.ceil(metrics.width));
      childYoga.setHeight(Math.ceil((parentStyle.fontSize ?? 16) * 1.3));
    } else {
      childYoga = buildYogaTree(child, ctx, fontKey);
    }
    yoga.insertChild(childYoga, yoga.getChildCount());
  }
  return yoga;
}

function readLayout(host: HostNode, yoga: YogaNode): LayoutNode {
  const computed = yoga.getComputedLayout();
  const children: LayoutNode[] = [];
  for (let index = 0; index < host.children.length; index += 1) {
    const child = host.children[index];
    const childYoga = yoga.getChild(index);
    const childComputed = childYoga.getComputedLayout();
    children.push({
      host: child,
      style: child instanceof HostNode ? styleOf(child) : {},
      x: childComputed.left,
      y: childComputed.top,
      width: childComputed.width,
      height: childComputed.height,
      children: child instanceof HostNode ? [] : [],
    });
    if (child instanceof HostNode) {
      children[index] = readLayout(child, childYoga);
    }
  }
  return {host, style: styleOf(host), x: computed.left, y: computed.top, width: computed.width, height: computed.height, children};
}

function paintLayout(ctx: SKRSContext2D, node: LayoutNode, parentX: number, parentY: number, inheritedFontFamily: string): void {
  const x = parentX + node.x;
  const y = parentY + node.y;
  if (node.host instanceof HostText) return;
  const currentFontFamily = node.style.fontFamily ?? inheritedFontFamily;
  ctx.save();
  ctx.globalAlpha *= node.style.opacity ?? 1;

  if (node.style.backgroundColor) {
    fillRoundedRect(ctx, x, y, node.width, node.height, node.style.borderRadius ?? 0, node.style.backgroundColor);
  }
  if (node.style.borderColor && node.style.borderWidth) {
    strokeRoundedRect(ctx, x, y, node.width, node.height, node.style.borderRadius ?? 0, node.style.borderColor, node.style.borderWidth);
  }
  if (node.host.type === "sdd-text") {
    const textValue = collectText(node.host);
    const fontSize = node.style.fontSize ?? 16;
    ctx.font = `${fontSize}px ${currentFontFamily}`;
    ctx.fillStyle = node.style.color ?? "#ffffff";
    const metrics = ctx.measureText(textValue);
    let textX = x;
    if (node.style.alignItems === "center") {
      textX = x + Math.max(0, (node.width - metrics.width) / 2);
    }
    ctx.fillText(textValue, textX, y + Math.max(0, (node.height - fontSize * 1.1) / 2));
  }
  if (node.style.overflow === "hidden") {
    ctx.beginPath();
    ctx.rect(x, y, node.width, node.height);
    ctx.clip();
  }
  for (const child of node.children) {
    paintLayout(ctx, child, x, y, currentFontFamily);
  }
  ctx.restore();
}

function collectText(node: HostNode): string {
  return node.props.text ?? node.children.map((child) => (child instanceof HostText ? child.text : collectText(child))).join("");
}

function applyYogaStyle(node: YogaNode, style: Style, type: string): void {
  node.setWidth(style.width ?? (type === "sdd-screen" ? SCREEN_WIDTH : 0));
  node.setHeight(style.height ?? (type === "sdd-screen" ? SCREEN_HEIGHT : 0));
  if (style.x !== undefined || style.y !== undefined) {
    node.setPositionType(PositionType.Absolute);
    node.setPosition(Yoga.EDGE_LEFT, style.x ?? 0);
    node.setPosition(Yoga.EDGE_TOP, style.y ?? 0);
  }
  if (style.padding !== undefined) {
    node.setPadding(Yoga.EDGE_ALL, style.padding);
  }
  node.setFlexDirection(style.flexDirection === "row" ? FlexDirection.Row : FlexDirection.Column);
  if (style.alignItems === "center") node.setAlignItems(Align.Center);
  if (style.alignItems === "flex-end") node.setAlignItems(Align.FlexEnd);
  if (style.justifyContent === "center") node.setJustifyContent(Justify.Center);
  if (style.justifyContent === "flex-end") node.setJustifyContent(Justify.FlexEnd);
  if (style.justifyContent === "space-between") node.setJustifyContent(Justify.SpaceBetween);
}

function styleOf(node: HostNode): Style {
  return (node.props.style ?? {}) as Style;
}

function fillRoundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string, lineWidth: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
