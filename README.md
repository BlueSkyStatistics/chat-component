# Chat Component with Output Attachments

A React-based chat component that supports attaching various types of output (code, charts, tables) to messages. Designed for integration with Electron applications.

## Installation

```bash
npm install
npm run dev    # for development
npm run build  # for production
```

## Features

- Markdown message rendering
- Code syntax highlighting
- Output attachments support (code, charts, tables)
- Settings for AI model configuration
- Streaming responses
- Copy to clipboard functionality
- Raw/formatted message view toggle

## Integration with Electron

### Setting up the Interface

1. First, include the preload script in your Electron main process:

```javascript
// main.js
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

2. Use the preload script (already included in the package):

```javascript
// preload.js is already set up in the package
// It exposes the sendOutputToChat method to the renderer process
// in a secure way using contextBridge
```

3. The Chat component automatically sets up event listeners to handle the output elements.
```

### Using sendOutputToChat Interface

The `sendOutputToChat` function accepts an output element object with the following structure:

```typescript
interface OutputElement {
  type: 'code' | 'chart' | 'table';
  data: string;
  metadata?: {
    language?: string;     // for code blocks
    title?: string;        // for charts
    [key: string]: any;    // additional metadata
  };
}
```

### Examples

#### Adding Code Output

```javascript
// Example: Adding Python code output
window.electronApi.sendOutputToChat({
  type: 'code',
  data: `
def calculate_mean(numbers):
    return sum(numbers) / len(numbers)

result = calculate_mean([1, 2, 3, 4, 5])
print(f"Mean: {result}")  # Output: Mean: 3.0
  `,
  metadata: {
    language: 'python',
    executionTime: '0.023s'
  }
});
```

#### Adding a Chart

```javascript
// Example: Adding a chart image
window.electronApi.sendOutputToChat({
  type: 'chart',
  data: chartCanvas.toDataURL('image/png'), // Base64 image data
  metadata: {
    title: 'Monthly Sales Distribution',
    type: 'bar-chart',
    dimensions: {
      width: 800,
      height: 400
    }
  }
});
```

#### Adding a Table

```javascript
// Example: Adding an HTML table
window.electronApi.sendOutputToChat({
  type: 'table',
  data: `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Item 1</td>
          <td>100</td>
        </tr>
        <tr>
          <td>Item 2</td>
          <td>200</td>
        </tr>
      </tbody>
    </table>
  `,
  metadata: {
    rowCount: 2,
    columnCount: 2,
    dataType: 'sales-data'
  }
});
```

### Real-world Usage Examples

#### Statistical Analysis Output

```javascript
// After running a statistical analysis
function addAnalysisOutput(results) {
  // Add the summary table
  window.electronApi.sendOutputToChat({
    type: 'table',
    data: results.getSummaryTable(),
    metadata: {
      title: 'Statistical Summary',
      analysisType: 'descriptive'
    }
  });

  // Add the distribution plot
  window.electronApi.sendOutputToChat({
    type: 'chart',
    data: results.getDistributionPlot(),
    metadata: {
      title: 'Data Distribution',
      chartType: 'histogram'
    }
  });

  // Add the R/Python code that was executed
  window.electronApi.sendOutputToChat({
    type: 'code',
    data: results.getExecutedCode(),
    metadata: {
      language: 'r',
      executionTime: results.runTime
    }
  });
}
```

#### Interactive Data Analysis

```javascript
// When user performs data transformation
function handleDataTransformation(data, transformation) {
  const result = performTransformation(data, transformation);
  
  // Add the transformation code
  window.electronApi.sendOutputToChat({
    type: 'code',
    data: result.code,
    metadata: {
      language: 'python',
      operation: 'data-transformation'
    }
  });

  // Add the result preview
  window.electronApi.sendOutputToChat({
    type: 'table',
    data: result.getPreviewTable(),
    metadata: {
      title: 'Transformed Data Preview',
      rowCount: result.previewRows,
      totalRows: result.totalRows
    }
  });
}
```

### Behavior Notes

1. **Attachment Lifecycle**:
   - Attachments appear in a pending area above the input field
   - Multiple attachments can be added before sending a message
   - Attachments are automatically cleared after the message is sent
   - Each attachment can be manually removed before sending

2. **Visual Feedback**:
   - Each attachment type has distinct styling
   - Code blocks include syntax highlighting
   - Charts are responsive and maintain aspect ratio
   - Tables are scrollable if they exceed the chat width

3. **Context for AI**:
   - All attachments become part of the message context
   - The AI model receives attachment data and metadata
   - Enables contextual responses based on the attached content

## API Reference

### OutputElement Interface

```typescript
interface OutputElement {
  type: 'code' | 'chart' | 'table';
  data: string;
  metadata?: {
    // Common metadata
    title?: string;
    timestamp?: number;
    
    // Code-specific metadata
    language?: string;
    executionTime?: string;
    
    // Chart-specific metadata
    chartType?: string;
    dimensions?: {
      width: number;
      height: number;
    };
    
    // Table-specific metadata
    rowCount?: number;
    columnCount?: number;
    dataType?: string;
    
    // Custom metadata
    [key: string]: any;
  };
}
```

## Best Practices

1. **Size Considerations**:
   - Optimize chart images before sending
   - Limit table size for better performance
   - Consider paginating large datasets

2. **Error Handling**:
   - Include error states in code outputs
   - Provide fallback content for failed chart renders
   - Validate table HTML for security

3. **Accessibility**:
   - Include alt text for charts
   - Ensure tables have proper headers
   - Maintain readable code formatting

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
