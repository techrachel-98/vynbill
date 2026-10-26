"use client";

import dynamic from "next/dynamic";

// The app restores its state from localStorage, so it renders in the browser only.
const VynbillApp = dynamic(() => import("./VynbillApp"), {
  ssr: false,
  loading: () => <div className="boot">Loading Vynbill…</div>,
});

export default function VynbillClient() {
  return <VynbillApp />;
}
