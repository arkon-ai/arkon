/**
 * Arkon animation constants and spring configs.
 * Use these for consistent motion across the app.
 */

export const timing = {
  button: 100,     // ms — button press feedback
  toast: 200,      // ms — toast enter/exit
  drawer: 300,     // ms — drawer slide
  modal: 200,      // ms — modal fade
  skeleton: 1500,  // ms — skeleton shimmer cycle
  hover: 150,      // ms — hover transitions
} as const;

export const spring = {
  snappy: { type: "spring" as const, stiffness: 300, damping: 25 },
  smooth: { type: "spring" as const, stiffness: 250, damping: 30 },
  gentle: { type: "spring" as const, stiffness: 200, damping: 25 },
} as const;

export const transition = {
  button: { duration: timing.button / 1000, ease: "easeOut" },
  toast: { ...spring.snappy },
  drawer: { ...spring.smooth },
  modal: { duration: timing.modal / 1000, ease: "easeOut" },
  fade: { duration: 0.15, ease: "easeInOut" },
} as const;

export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideRight: {
    initial: { x: "100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "100%", opacity: 0 },
  },
  slideUp: {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 20, opacity: 0 },
  },
  scaleIn: {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
  },
} as const;
