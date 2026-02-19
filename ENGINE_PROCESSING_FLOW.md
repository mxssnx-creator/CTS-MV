# Engine Processing Flow - Connection Filtering & Execution

## System Architecture Overview

The trade engine now processes connections with this strict filtering hierarchy:

### 1. Connection States
```
is_inserted = True/False       (Connection added to system)
is_enabled = True/False        (Settings toggle - connection available for engines)
is_enabled_dashboard = True/False (Active Connections display toggle)
is_live_trade = True/False     (Main Engine enabled via slider)
is_preset_trade = True/False   (Preset Engine enabled via slider)
```

### 2. Default State for New Connections
```javascript
is_enabled: false              // Disabled by default (Settings)
is_enabled_dashboard: false    // Not shown in Active Connections by default
is_live_trade: false           // Main Engine disabled by default
is_preset_trade: false         // Preset Engine disabled by default
```

### 3. Active Connections Filtering (GET /api/settings/connections/active)
Only returns connections that satisfy **BOTH** conditions:
```
is_inserted = true AND is_enabled = true
```

These are the only connections eligible for engine processing.

### 4. Engine Processing Flow

**Main Engine (Live Trade)**
```
1. Connection must be in Active Connections (is_inserted=true AND is_enabled=true)
2. User slides toggle to enable is_live_trade=true
3. Engine starts via POST /api/settings/connections/[id]/live-trade
4. Engine processes until user disables (is_live_trade=false)
```

**Preset Engine (Preset Trade)**
```
1. Connection must be in Active Connections (is_inserted=true AND is_enabled=true)
2. User selects preset type to enable is_preset_trade=true
3. Engine starts via POST /api/settings/connections/[id]/preset-toggle
4. Engine processes until user disables
```

### 5. System Initialization Flow
```
1. Predefined connections auto-created with ALL disabled
2. Dashboard shows empty "Active Connections" (none inserted+enabled yet)
3. User adds connection to Settings (is_enabled toggles to true)
4. Connection now appears in Active Connections
5. User can enable Main/Preset engines for that connection
```

### 6. Processing Guarantee
✓ Engine processes ONLY if ALL conditions met:
- is_inserted = true
- is_enabled = true  
- is_live_trade = true (for Main Engine) OR is_preset_trade = true (for Preset Engine)
- User has configured indicators/strategies

✗ Engine does NOT process if:
- Connection not inserted
- Connection is disabled in Settings
- Engine toggle is off
- No indicators/strategies configured

## Changes Made

1. **Active Connections Route** (`/app/api/settings/connections/active/route.ts`)
   - Changed filter to require BOTH `is_inserted=true` AND `is_enabled=true`
   - Only these connections can run engines
   - Removed dashboard-only filtering

2. **Connection Creation Route** (`/app/api/settings/connections/route.ts`)
   - Predefined connections now start with ALL flags disabled by default
   - Ensures system starts in safe idle state
   - Users must explicitly enable each flag to activate processing

## Result
The engine now has complete control with three independent toggle points:
1. Settings toggle (is_enabled) - Connection available?
2. Active Connections (is_enabled_dashboard) - Show on dashboard?
3. Engine sliders (is_live_trade/is_preset_trade) - Process with engine?

User must explicitly enable each step, ensuring safe and controlled operation.
