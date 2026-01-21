#!/bin/bash

# Script para fijar errores de unused variables agregando prefijo _

# Array de archivos y líneas donde cambiar catch(err) o catch(error) por catch(_err)
declare -a files_to_fix=(
  "src/components/eventbrite/CheckInScanner.tsx:128"
  "src/components/eventbrite/EmailComposer.tsx:144"
  "src/components/eventbrite/SMSComposer.tsx:112"
  "src/pages/PublicEvent.tsx:128"
  "src/pages/PublicEvent.tsx:169"
  "src/hooks/useSMS.ts:39"
  "src/hooks/useSMS.ts:54"
  "src/hooks/useSMS.ts:78"
  "src/hooks/useSMS.ts:103"
  "src/hooks/useSMS.ts:116"
  "src/views/EventsView.tsx:70"
  "src/views/EventsView.tsx:102"
  "src/views/EventsView.tsx:129"
  "src/views/EventsView.tsx:153"
  "src/views/EventsView.tsx:170"
  "src/views/EventsView.tsx:190"
  "src/views/EventsView.tsx:207"
  "src/views/IntegrationsView.tsx:130"
  "src/views/IntegrationsView.tsx:151"
  "src/views/IntegrationsView.tsx:182"
  "src/views/IntegrationsView.tsx:215"
  "src/views/MonitoringView.tsx:110"
  "src/views/MonitoringView.tsx:125"
  "src/views/MonitoringView.tsx:147"
  "src/views/SMSView.tsx:77"
  "src/views/SMSView.tsx:115"
  "src/views/SMSView.tsx:129"
  "src/views/SponsorsView.tsx:110"
  "src/views/SponsorsView.tsx:125"
  "src/views/SponsorsView.tsx:147"
  "src/views/TicketsView.tsx:110"
  "src/views/TicketsView.tsx:123"
  "src/views/TicketsView.tsx:135"
  "src/views/TicketsView.tsx:159"
)

echo "🔧 Fixing unused variable errors..."
echo "Total files to check: ${#files_to_fix[@]}"
echo ""

# Fix catch(err) or catch(error) patterns
find src app -name "*.tsx" -o -name "*.ts" | while read file; do
  # Replace } catch (err) { with } catch (_err) {
  sed -i '' 's/} catch (\([a-z]*err\)) {/} catch (_\1) {/g' "$file"
  # Replace } catch (error) { with } catch (_error) {
  sed -i '' 's/} catch (error) {/} catch (_error) {/g' "$file"
  # Replace throw error; with just remove if unused
done

# Remove unused imports in app/page.tsx
sed -i '' '/AnimatePresence,/d' app/page.tsx 2>/dev/null || true
sed -i '' '/Globe,/d' app/page.tsx 2>/dev/null || true
sed -i '' '/Play,/d' app/page.tsx 2>/dev/null || true
sed -i '' '/Calendar,/d' app/page.tsx 2>/dev/null || true
sed -i '' '/FileText,/d' app/page.tsx 2>/dev/null || true

# Remove formatCurrency if not used
sed -i '' '/function formatCurrency/,/^}/d' app/page.tsx 2>/dev/null || true

echo "✅ Auto-fixes applied!"
echo ""
echo "🔍 Remaining issues:"
npm run lint 2>&1 | grep "problems\|errors\|warnings" | tail -1
