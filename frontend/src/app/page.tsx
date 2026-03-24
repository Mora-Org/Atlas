"use client"
import Link from 'next/link'
import { ArrowRight, Zap, Target, Layout, Database } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function Home() {
  const [dataModel, setDataModel] = useState<any>(null)
  
  useEffect(() => {
    // Attempt to fetch any dynamic table called "posts" or similar to show data connection.
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/posts`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDataModel(data[0]) 
        }
      })
      .catch(() => console.log('No posts table yet, showing blank template'))
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center">
      {/* Background gradients */}
      <div className="absolute top-0 -left-1/4 w-[150%] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center z-10">
        <div className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-500">
          TemplateOS
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/admin" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Admin Panel</Link>
          <Link href="/explore" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Data Explorer</Link>
          <a href="#" className="px-4 py-2 bg-white text-black font-semibold rounded-full text-sm hover:bg-neutral-200 transition-colors">
            Get Started
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 flex flex-col justify-center py-20 z-10">
        <div className="max-w-4xl text-center mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            System Live & Connected
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-neutral-500">
            Build dynamic structures <br className="hidden md:block" /> at lightning speed.
          </h1>
          
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Unleash the power of headless CMS with a generated UI. No more boilerplate code. Scale your application seamlessly.
          </p>
          
          <div className="flex items-center justify-center gap-4 pt-4">
            <Link 
              href="/admin"
              className="px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Enter Admin Panel
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-5xl mx-auto">
          {[
            { icon: Zap, title: "Next.js 14 App Router", desc: "Experience the fastest web standards natively, optimized for Vercel." },
            { icon: Database, title: "Dynamic FastAPI", desc: "Python-driven schema generation. Define DB columns instantly." },
            { icon: Layout, title: "Beautiful Interfaces", desc: "Tailwind CSS and Shadcn-inspired UI out of the box." }
          ].map((feat, i) => (
            <div key={i} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800/50 backdrop-blur-sm hover:bg-neutral-800/50 transition-colors">
              <feat.icon className="w-8 h-8 text-indigo-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feat.title}</h3>
              <p className="text-neutral-400 mb-6 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>

        {/* Dynamic Content Example */}
        {dataModel && (
          <div className="mt-20 p-8 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 backdrop-blur-md max-w-3xl mx-auto text-center animate-in zoom-in duration-700">
            <h3 className="text-indigo-300 font-semibold mb-2 flex items-center justify-center gap-2">
              <Target className="w-5 h-5"/> Live Data From Database
            </h3>
            <p className="text-2xl font-medium text-white max-w-xl mx-auto mb-4">
              "{dataModel.title || dataModel.name || dataModel.content || 'Data fetched successfully'}"
            </p>
            <p className="text-neutral-400 text-sm">
              This block dynamically appeared because you have records in your database!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
