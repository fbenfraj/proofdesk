"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

// Shared client seam (Story 1.6) so a Board row (page content) can open the
// Claim Card drawer (shell chrome) — the two live in different subtrees under
// the (ui) layout. Story 1.8 extends it with what the dialog a11y contract
// (UX-DR24) needs: the originating row element (focus returns there on close)
// and the ordered claim ids (step-to-next advances without closing).
interface ClaimDrawerContextValue {
  selectedClaimId: string | null;
  /** Open a Claim Card; `triggerEl` is the row that opened it — focus returns
   *  there on close (UX-DR24). */
  openClaim: (claimId: string, triggerEl?: HTMLElement | null) => void;
  close: () => void;
  /** Advance to the next claim in the registered board order WITHOUT closing;
   *  no-op at the end of the list. */
  stepToNext: () => void;
  /** The board registers its row order so step-to-next knows "next". */
  registerOrder: (orderedClaimIds: string[]) => void;
  /** True when the selected claim has a next sibling in the registered order. */
  hasNext: boolean;
}

const ClaimDrawerContext = createContext<ClaimDrawerContextValue | null>(null);

export function ClaimDrawerProvider({ children }: { children: ReactNode }) {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  // Refs (not state): the trigger element and the board order are read at
  // open/step/close time; they must not trigger re-renders of the whole tree.
  const triggerRef = useRef<HTMLElement | null>(null);
  const orderRef = useRef<string[]>([]);

  const computeHasNext = useCallback((claimId: string): boolean => {
    const idx = orderRef.current.indexOf(claimId);
    return idx >= 0 && idx < orderRef.current.length - 1;
  }, []);

  const openClaim = useCallback(
    (claimId: string, triggerEl?: HTMLElement | null) => {
      triggerRef.current = triggerEl ?? null;
      setSelectedClaimId(claimId);
      setHasNext(computeHasNext(claimId));
    },
    [computeHasNext],
  );

  const close = useCallback(() => {
    const el = triggerRef.current;
    triggerRef.current = null;
    setSelectedClaimId(null);
    setHasNext(false);
    // Return focus to the exact originating row after the drawer closes
    // (UX-DR24). rAF lets React commit the close first.
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  const stepToNext = useCallback(() => {
    setSelectedClaimId((current) => {
      if (current === null) return current;
      const idx = orderRef.current.indexOf(current);
      if (idx < 0 || idx >= orderRef.current.length - 1) return current;
      const next = orderRef.current[idx + 1];
      // Keep focus-return sensible: point the trigger at the next row.
      triggerRef.current =
        document.querySelector<HTMLElement>(`[data-claim-id="${next}"]`) ?? triggerRef.current;
      setHasNext(computeHasNext(next));
      return next;
    });
  }, [computeHasNext]);

  const registerOrder = useCallback((orderedClaimIds: string[]) => {
    orderRef.current = orderedClaimIds;
  }, []);

  const value = useMemo(
    () => ({ selectedClaimId, openClaim, close, stepToNext, registerOrder, hasNext }),
    [selectedClaimId, openClaim, close, stepToNext, registerOrder, hasNext],
  );
  return <ClaimDrawerContext.Provider value={value}>{children}</ClaimDrawerContext.Provider>;
}

export function useClaimDrawer(): ClaimDrawerContextValue {
  const context = useContext(ClaimDrawerContext);
  if (!context) {
    throw new Error("useClaimDrawer must be used within a ClaimDrawerProvider");
  }
  return context;
}
