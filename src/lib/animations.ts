export async function flyFromTo(
  startEl: HTMLElement | null | undefined,
  targetEl: HTMLElement | null | undefined,
  label: string | number
) {
  // no-op or invalid parameters
  if (!startEl || !targetEl) return;

  try {
    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const dx = endX - startX;
    const dy = endY - startY;

    const flying = document.createElement("div");
    flying.className = "flying-ball dynamic";
    flying.textContent = String(label);
    flying.style.position = "fixed";
    flying.style.left = `${startX}px`;
    flying.style.top = `${startY}px`;
    flying.style.transform = "translate(-50%, -50%)";
    flying.style.zIndex = "9999";
    flying.style.pointerEvents = "none";

    document.body.appendChild(flying);

    // Force a reflow so transition runs
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    flying.offsetWidth;

    // Animate via transform
    flying.style.transition =
      "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.6s";
    flying.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;

    // optionally fade during travel
    setTimeout(() => {
      flying.style.opacity = "0.95";
    }, 10);

    // Wait for animation end
    await new Promise((resolve) => {
      const onEnd = () => {
        // small scale/flash on target
        flying.classList.add("animate");
        setTimeout(() => resolve(null), 220);
      };
      flying.addEventListener("transitionend", onEnd, { once: true });

      // safety: remove after fixed time
      setTimeout(resolve, 1200);
    });

    // cleanup
    try {
      flying.remove();
    } catch (err) {
      /* ignore */
    }
  } catch (err) {
    console.warn("flyFromTo error", err);
  }
}
