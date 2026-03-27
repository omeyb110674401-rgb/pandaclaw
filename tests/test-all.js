/**
 * 测试入口
 */

const { runAllTests } = require('./test-runner');

console.log('🐼 PandaClaw - 运行测试\n');

runAllTests()
  .then(results => {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log('\n' + '='.repeat(50));
    console.log(`测试结果: ${passed} 通过 / ${failed} 失败`);
    console.log('='.repeat(50));
    
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });