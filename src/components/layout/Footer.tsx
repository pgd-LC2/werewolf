export function Footer() {
  return (
    <footer className="mt-12 border-t border-surface-highlight/40 pt-6 text-sm text-gray-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Werewolf Console · 专注于狼人杀对局管理。</p>
        <p className="text-gray-400">保持公平公正，每一票与每一次夜间行动都有迹可循。</p>
      </div>
    </footer>
  )
}
