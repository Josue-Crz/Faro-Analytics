'use client';

import { LineChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { responseTrend } from '@/lib/demo-data';

export function ResponseTrendChart() {
  const options = {
    axes: {
      bottom: {
        mapsTo: 'date',
        scaleType: ScaleTypes.TIME,
      },
      left: {
        domain: [0, 50],
        mapsTo: 'value',
        scaleType: ScaleTypes.LINEAR,
        ticks: {
          formatter: (value: number | Date) => `${Number(value)}%`,
        },
      },
    },
    curve: 'curveMonotoneX' as const,
    data: {
      loading: false,
    },
    grid: {
      x: { enabled: false },
      y: { enabled: true },
    },
    height: '280px',
    legend: {
      alignment: 'center' as const,
      position: 'bottom' as const,
    },
    points: {
      enabled: true,
      radius: 3,
    },
    toolbar: {
      enabled: false,
    },
  };

  return <LineChart data={responseTrend} options={options} />;
}
