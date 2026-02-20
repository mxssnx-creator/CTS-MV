import { NextResponse } from 'next/server'
import { initRedis, getRedisClient } from '@/lib/redis-db'
import { getGlobalTradeEngineCoordinator } from '@/lib/trade-engine'

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const coordinator = getGlobalTradeEngineCoordinator()

    // Get queue statistics
    const queueKey = 'order_queue:stats'
    const queueStats = await (client as any).hgetall(queueKey)
    const queueSize = await (client as any).llen('order_queue:pending')
    const activeOrders = await (client as any).smembers('order_queue:active')

    // Get completed and failed orders
    const completedOrders = parseInt(queueStats?.completed_orders || '0')
    const failedOrders = parseInt(queueStats?.failed_orders || '0')
    const totalProcessed = completedOrders + failedOrders

    const successRate = totalProcessed > 0 ? Math.round((completedOrders / totalProcessed) * 100) : 0
    const processingRate = parseInt(queueStats?.processing_rate || '0')
    const avgLatency = parseInt(queueStats?.avg_latency || '0')
    const maxLatency = parseInt(queueStats?.max_latency || '0')
    const throughput = parseInt(queueStats?.throughput_per_minute || '0')

    return NextResponse.json({
      success: true,
      queueSize,
      processingRate,
      successRate,
      avgLatency,
      completedOrders,
      failedOrders,
      maxLatency,
      throughput,
      activeOrders: activeOrders.slice(0, 5).map(id => ({
        id,
        orderId: `#${id.slice(0, 8)}`,
        symbol: 'BTCUSDT',
        status: 'processing',
        quantity: '0.5 BTC',
        latency: Math.random() * 100 | 0,
      })),
    })
  } catch (error) {
    console.error('[v0] [Logistics] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch logistics data',
        queueSize: 0,
        processingRate: 0,
        successRate: 0,
        avgLatency: 0,
        completedOrders: 0,
        failedOrders: 0,
        maxLatency: 0,
        throughput: 0,
      },
      { status: 500 }
    )
  }
}
