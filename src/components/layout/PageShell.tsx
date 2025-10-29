import type { PropsWithChildren } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'

export function PageShell({ children }: PropsWithChildren) {
  return (
    <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <Header />
        <main className="space-y-16">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
