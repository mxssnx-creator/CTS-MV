export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 20, fontFamily: "system-ui" }}>
        <h1>CTS v3.2 - System Online</h1>
        <p>Server is running successfully. Redis migrations completed.</p>
        <hr />
        {children}
      </body>
    </html>
  )
}
