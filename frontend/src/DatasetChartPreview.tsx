import React from 'react';
import {MatchedDataPreview} from './DataManagement';
export function DatasetChartPreview({dataset,data,templates}:any){
 return <section><h3>图表预览</h3><MatchedDataPreview dataset={{...dataset,dataSpec:data}} templates={templates}/></section>
}
