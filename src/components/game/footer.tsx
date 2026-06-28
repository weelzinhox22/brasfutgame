'use client'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/60 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
        <p>
          <span className="font-semibold text-foreground">Football Historic Championship</span> — Multiplayer · Draft · Simulação em tempo real
        </p>
        <p className="flex items-center gap-3">
          <span>Times históricos: 549</span>
          <span>·</span>
          <span>Jogadores: 9.356</span>
          <span>·</span>
          <span>Salas: até 12 jogadores + bots</span>
        </p>
      </div>
    </footer>
  )
}
