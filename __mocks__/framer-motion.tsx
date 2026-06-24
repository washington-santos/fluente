import React from 'react'

// Lightweight framer-motion mock for test environments.
// AnimatePresence with mode="wait" causes infinite RAF loops in jsdom;
// this mock renders children directly without animations.

type MotionProps = React.HTMLAttributes<HTMLElement> & {
  initial?: unknown
  animate?: unknown
  exit?: unknown
  transition?: unknown
  variants?: unknown
  whileHover?: unknown
  whileTap?: unknown
  layout?: unknown
  children?: React.ReactNode
}

function makeMotionComponent(tag: string) {
  const Component = ({ children, initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, whileHover: _wh, whileTap: _wt, layout: _l, ...props }: MotionProps) =>
    React.createElement(tag, props, children)
  Component.displayName = `motion.${tag}`
  return Component
}

export const motion = {
  div: makeMotionComponent('div'),
  span: makeMotionComponent('span'),
  p: makeMotionComponent('p'),
  section: makeMotionComponent('section'),
  article: makeMotionComponent('article'),
  main: makeMotionComponent('main'),
  header: makeMotionComponent('header'),
  footer: makeMotionComponent('footer'),
  nav: makeMotionComponent('nav'),
  ul: makeMotionComponent('ul'),
  li: makeMotionComponent('li'),
  button: makeMotionComponent('button'),
  a: makeMotionComponent('a'),
  img: makeMotionComponent('img'),
  h1: makeMotionComponent('h1'),
  h2: makeMotionComponent('h2'),
  h3: makeMotionComponent('h3'),
}

export const AnimatePresence = ({ children }: { children?: React.ReactNode; mode?: string }) =>
  React.createElement(React.Fragment, null, children)
