import { useEffect, useMemo, useState } from "react";
import { Copy, RotateCcw, SlidersHorizontal } from "lucide-react";

export interface LayoutTunerValues {
    leftRatio: number;
    rightRatio: number;
    gap: number;
    gridShiftY: number;
    leftOffsetY: number;
    middleOffsetY: number;
    rightOffsetY: number;
    heroMinHeight: number;
    heroOffsetY: number;
    featureOffsetY: number;
    testimonialOffsetY: number;
}

interface LayoutTunerProps {
    values: LayoutTunerValues;
    onChange: (next: LayoutTunerValues) => void;
    onReset: () => void;
}

const sectionClass = "space-y-2 rounded-xl border border-white/10 bg-white/5 p-3";
const rowClass = "space-y-1.5";

function TunerSlider({
    label,
    value,
    min,
    max,
    step = 1,
    unit = "",
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (value: number) => void;
}) {
    return (
        <div className={rowClass}>
            <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="font-medium text-white/85">{label}</span>
                <span className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-[11px] text-primary">
                    {value.toFixed(step < 1 ? 1 : 0)}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[hsl(var(--primary))]"
            />
        </div>
    );
}

const LayoutTuner = ({ values, onChange, onReset }: LayoutTunerProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

    const middleRatio = useMemo(
        () => Number((100 - values.leftRatio - values.rightRatio).toFixed(1)),
        [values.leftRatio, values.rightRatio],
    );

    useEffect(() => {
        if (copyState === "idle") return;
        const timeout = window.setTimeout(() => setCopyState("idle"), 1200);
        return () => window.clearTimeout(timeout);
    }, [copyState]);

    const copyValues = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify({ ...values, middleRatio }, null, 2));
            setCopyState("copied");
        } catch {
            setCopyState("error");
        }
    };

    const updateValues = (patch: Partial<LayoutTunerValues>) => {
        onChange({ ...values, ...patch });
    };

    const setLeftRatio = (leftRatio: number) => {
        const clampedLeft = Math.min(40, Math.max(18, leftRatio));
        const nextRight = Math.min(values.rightRatio, 100 - clampedLeft - 30);
        updateValues({ leftRatio: clampedLeft, rightRatio: Math.max(18, nextRight) });
    };

    const setRightRatio = (rightRatio: number) => {
        const clampedRight = Math.min(40, Math.max(18, rightRatio));
        const nextLeft = Math.min(values.leftRatio, 100 - clampedRight - 30);
        updateValues({ rightRatio: clampedRight, leftRatio: Math.max(18, nextLeft) });
    };

    return (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] hidden xl:flex xl:justify-start">
            <div className="pointer-events-auto w-full max-w-[360px] rounded-[1.35rem] border border-white/10 bg-black/80 text-white shadow-[0_30px_80px_-36px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4 text-primary" />
                            <p className="text-sm font-semibold">Layout Tuner</p>
                        </div>
                        <p className="mt-1 text-[11px] text-white/60">
                            Dev only. Resize the desktop composition, then copy the values.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen((open) => !open)}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/5 hover:text-white"
                    >
                        {isOpen ? "Hide" : "Show"}
                    </button>
                </div>

                {isOpen && (
                    <div className="max-h-[78vh] space-y-3 overflow-y-auto px-4 py-4">
                        <div className={sectionClass}>
                            <div className="flex items-center justify-between gap-3 text-[12px] text-white/80">
                                <span className="font-medium">Desktop columns</span>
                                <span className="font-mono text-[11px] text-primary">
                                    {values.leftRatio.toFixed(1)} / {middleRatio.toFixed(1)} / {values.rightRatio.toFixed(1)}
                                </span>
                            </div>
                            <TunerSlider label="Left column" value={values.leftRatio} min={18} max={40} step={0.5} unit="%" onChange={setLeftRatio} />
                            <div className="space-y-1 rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/70">
                                <div className="flex items-center justify-between gap-3">
                                    <span>Middle column</span>
                                    <span className="font-mono text-primary">{middleRatio.toFixed(1)}%</span>
                                </div>
                                <p className="leading-relaxed text-white/50">
                                    Middle stays focal and is derived from left + right so the whole row always reflows.
                                </p>
                            </div>
                            <TunerSlider label="Right column" value={values.rightRatio} min={18} max={40} step={0.5} unit="%" onChange={setRightRatio} />
                            <TunerSlider label="Column gap" value={values.gap} min={8} max={28} unit="px" onChange={(gap) => updateValues({ gap })} />
                        </div>

                        <div className={sectionClass}>
                            <div className="text-[12px] font-medium text-white/80">Position</div>
                            <TunerSlider label="Whole layout Y" value={values.gridShiftY} min={-60} max={60} unit="px" onChange={(gridShiftY) => updateValues({ gridShiftY })} />
                            <TunerSlider label="Left panel Y" value={values.leftOffsetY} min={-60} max={60} unit="px" onChange={(leftOffsetY) => updateValues({ leftOffsetY })} />
                            <TunerSlider label="Middle panel Y" value={values.middleOffsetY} min={-60} max={60} unit="px" onChange={(middleOffsetY) => updateValues({ middleOffsetY })} />
                            <TunerSlider label="Right panel Y" value={values.rightOffsetY} min={-60} max={60} unit="px" onChange={(rightOffsetY) => updateValues({ rightOffsetY })} />
                        </div>

                        <div className={sectionClass}>
                            <div className="text-[12px] font-medium text-white/80">Middle stack</div>
                            <TunerSlider label="Hero min height" value={values.heroMinHeight} min={220} max={460} unit="px" onChange={(heroMinHeight) => updateValues({ heroMinHeight })} />
                            <TunerSlider label="Hero Y" value={values.heroOffsetY} min={-60} max={60} unit="px" onChange={(heroOffsetY) => updateValues({ heroOffsetY })} />
                            <TunerSlider label="Services Y" value={values.featureOffsetY} min={-60} max={60} unit="px" onChange={(featureOffsetY) => updateValues({ featureOffsetY })} />
                            <TunerSlider label="Testimonial Y" value={values.testimonialOffsetY} min={-60} max={60} unit="px" onChange={(testimonialOffsetY) => updateValues({ testimonialOffsetY })} />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={onReset}
                                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset
                            </button>
                            <button
                                type="button"
                                onClick={copyValues}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                <Copy className="h-3.5 w-3.5" />
                                {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy values"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LayoutTuner;