/**
 * Realtime Processor
 * Processes real-time updates for active positions with market data stream
 */

import { getSettings, setSettings } from "@/lib/redis-db"
import { PseudoPositionManager } from "./pseudo-position-manager"
import { MarketDataStream } from "@/lib/realtime/market-data-stream"

export class RealtimeProcessor {
  private connectionId: string
  private positionManager: PseudoPositionManager
  private marketDataStream: MarketDataStream | null = null

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.positionManager = new PseudoPositionManager(connectionId)
  }

  /**
   * Initialize market data stream
   */
  async initializeStream(wsUrl: string, symbols: string[]): Promise<void> {
    try {
      this.marketDataStream = new MarketDataStream(this.connectionId, wsUrl)
      await this.marketDataStream.start(symbols)
      console.log("[v0] Market data stream initialized")
    } catch (error) {
      console.error("[v0] Failed to initialize market data stream:", error)
    }
  }

  /**
   * Stop market data stream
   */
  stopStream(): void {
    if (this.marketDataStream) {
      this.marketDataStream.stop()
      this.marketDataStream = null
    }
  }

  /**
   * Process real-time updates for all active positions
   */
  async processRealtimeUpdates(): Promise<void> {
    try {
      const activePositions = await this.positionManager.getActivePositions()

      if (activePositions.length === 0) {
        return
      }

      console.log(`[v0] Processing ${activePositions.length} active positions`)

      // Process each position
      await Promise.all(activePositions.map((position) => this.processPosition(position)))

      // Update engine state in Redis
      const engineState = await getSettings(`trade_engine_state:${this.connectionId}`)
      await setSettings(`trade_engine_state:${this.connectionId}`, {
        ...engineState,
        active_positions_count: activePositions.length,
        updated_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error("[v0] Failed to process realtime updates:", error)
    }
  }

  /**
   * Process individual position
   */
  private async processPosition(position: any): Promise<void> {
    try {
      // Get current market price (from stream if available, otherwise from database)
      let currentPrice: number | null = null

      if (this.marketDataStream) {
        currentPrice = this.marketDataStream.getLatestPrice(position.symbol)
      }

      if (!currentPrice) {
        currentPrice = await this.getCurrentPriceFromDB(position.symbol)
      }

      if (!currentPrice) {
        return
      }

      // Update position with current price
      await this.positionManager.updatePosition(position.id, currentPrice)

      // Calculate profit/loss
      const profitLoss = this.calculateProfitLoss(position, currentPrice)

      // Check if take profit or stop loss hit
      if (this.shouldCloseTakeProfit(position, currentPrice, profitLoss)) {
        await this.positionManager.closePosition(position.id, "take_profit")
      } else if (this.shouldCloseStopLoss(position, currentPrice, profitLoss)) {
        await this.positionManager.closePosition(position.id, "stop_loss")
      } else if (position.trailing_enabled) {
        // Update trailing stop if enabled
        await this.updateTrailingStop(position, currentPrice, profitLoss)
      }
    } catch (error) {
      console.error(`[v0] Failed to process position ${position.id}:`, error)
    }
  }

  /**
   * Get current market price from database
   */
  private async getCurrentPriceFromDB(symbol: string): Promise<number | null> {
    try {
      const [data] = await sql`
        SELECT close FROM market_data
        WHERE trading_pair_id IN (
          SELECT id FROM trading_pairs WHERE symbol = ${symbol}
        )
        ORDER BY timestamp DESC
        LIMIT 1
      `
      return data ? Number.parseFloat(data.close) : null
    } catch (error) {
      console.error(`[v0] Failed to get current price for ${symbol}:`, error)
      return null
    }
  }

  /**
   * Calculate profit/loss for position
   */
  private calculateProfitLoss(position: any, currentPrice: number): number {
    const entryPrice = Number.parseFloat(position.entry_price)
    const quantity = Number.parseFloat(position.quantity)

    if (position.side === "long") {
      return (currentPrice - entryPrice) * quantity
    } else {
      return (entryPrice - currentPrice) * quantity
    }
  }

  /**
   * Check if take profit should be triggered
   */
  private shouldCloseTakeProfit(position: any, currentPrice: number, profitLoss: number): boolean {
    const entryPrice = Number.parseFloat(position.entry_price)
    const takeprofitFactor = Number.parseFloat(position.takeprofit_factor)

    if (position.side === "long") {
      const takeProfitPrice = entryPrice * (1 + takeprofitFactor / 100)
      return currentPrice >= takeProfitPrice
    } else {
      const takeProfitPrice = entryPrice * (1 - takeprofitFactor / 100)
      return currentPrice <= takeProfitPrice
    }
  }

  /**
   * Check if stop loss should be triggered
   */
  private shouldCloseStopLoss(position: any, currentPrice: number, profitLoss: number): boolean {
    const entryPrice = Number.parseFloat(position.entry_price)
    const stoplossRatio = Number.parseFloat(position.stoploss_ratio)

    if (position.side === "long") {
      const stopLossPrice = entryPrice * (1 - stoplossRatio / 100)
      return currentPrice <= stopLossPrice
    } else {
      const stopLossPrice = entryPrice * (1 + stoplossRatio / 100)
      return currentPrice >= stopLossPrice
    }
  }

  /**
   * Update trailing stop
   */
  private async updateTrailingStop(position: any, currentPrice: number, profitLoss: number): Promise<void> {
    try {
      const entryPrice = Number.parseFloat(position.entry_price)
      const stoplossRatio = Number.parseFloat(position.stoploss_ratio)

      // Calculate trailing stop distance
      const trailingDistance = currentPrice * (stoplossRatio / 100)

      // Update trailing stop in database
      await sql`
        UPDATE pseudo_positions
        SET trailing_stop_price = ${currentPrice - trailingDistance}
        WHERE id = ${position.id}
      `

      console.log(`[v0] Updated trailing stop for position ${position.id}`)
    } catch (error) {
      console.error(`[v0] Failed to update trailing stop for position ${position.id}:`, error)
    }
  }

  /**
   * Get stream status
   */
  getStreamStatus(): string {
    return this.marketDataStream?.getStatus() || "not_initialized"
  }
}
