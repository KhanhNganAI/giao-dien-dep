import { useEffect, useState } from "react";

const dragons = [
  { name: "starlight", className: "dragon-duo-starlight", frameOffset: 0 },
  { name: "night", className: "dragon-duo-night", frameOffset: 3 },
] as const;
const frameDuration = 520;

export function DragonDuo() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    for (const dragon of dragons) {
      for (let index = 1; index <= 8; index += 1) {
        const image = new Image();
        image.src = `/game/dragon-duo/${dragon.name}-clean-${index}.webp?v=4`;
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % 8), frameDuration);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
      {dragons.map((dragon) => {
        const currentFrame = (frame + dragon.frameOffset) % 8;
        const nextFrame = (currentFrame + 1) % 8;
        return (
          <div key={dragon.name} className={`dragon-duo-flight ${dragon.className}`}>
            <div className="dragon-duo-wobble">
              <img
                className="dragon-duo-sprite"
                src={`/game/dragon-duo/${dragon.name}-clean-${currentFrame + 1}.webp?v=4`}
                alt=""
                draggable={false}
              />
              <img
                key={nextFrame}
                className="dragon-duo-sprite dragon-duo-next-frame"
                src={`/game/dragon-duo/${dragon.name}-clean-${nextFrame + 1}.webp?v=4`}
                alt=""
                draggable={false}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
